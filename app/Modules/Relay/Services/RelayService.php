<?php

declare(strict_types=1);

namespace App\Modules\Relay\Services;

use App\Exceptions\ApiException;
use App\Modules\Relay\Events\CommandRelayed;
use App\Modules\Relay\Events\StateUpdated;
use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use App\Modules\Sessions\Models\SessionCommand;
use App\Support\SafeBroadcast;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/** LLD §7.2 — command intake (validate → dedupe → sequence → broadcast) and snapshot intake. */
class RelayService
{
    /**
     * @param  array{commandId: string, name: string, payload: array<string, mixed>, baseRevision: ?int, issuedAt: int}  $data
     */
    public function relayCommand(Device $device, PresentationSession $session, array $data): RelayResult
    {
        $started = microtime(true);
        try {
            $command = DB::transaction(function () use ($device, $session, $data) {
                $now = Carbon::now();
                // Atomic, gapless per-session sequence; the row lock also serialises concurrent commands.
                $seq = (int) DB::selectOne(
                    'UPDATE presentation_sessions SET command_seq = command_seq + 1, last_activity_at = ? WHERE id = ? RETURNING command_seq',
                    [$now, $session->id],
                )->command_seq;

                return SessionCommand::query()->create([
                    'session_id' => $session->id,
                    'command_id' => $data['commandId'],
                    'device_id' => $device->id,
                    'seq' => $seq,
                    'name' => $data['name'],
                    'payload' => $data['payload'],
                    'base_revision' => $data['baseRevision'],
                    'status' => SessionCommand::STATUS_PENDING,
                    'relayed_at' => $now,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            return $this->duplicate($device, $session, $data);
        }

        $this->broadcastCommand($command, $device, $data['issuedAt']);
        Log::info('command relayed', [
            'session_id' => $session->id, 'device_id' => $device->id, 'command_id' => $command->command_id,
            'seq' => $command->seq, 'name' => $command->name, 'relay_ms' => round((microtime(true) - $started) * 1000, 1),
        ]);

        return new RelayResult($command, false);
    }

    /** A repeat POST: same answer; re-broadcast only while it is not yet acknowledged. */
    private function duplicate(Device $device, PresentationSession $session, array $data): RelayResult
    {
        $command = SessionCommand::query()
            ->where('session_id', $session->id)
            ->where('command_id', $data['commandId'])
            ->firstOrFail();

        if (! $command->isAcked()) {
            $command->forceFill(['relayed_at' => Carbon::now()])->save(); // a retry is a fresh relay for the staleness window
            $this->broadcastCommand($command, $device, $data['issuedAt']);
        }

        return new RelayResult($command, true);
    }

    private function broadcastCommand(SessionCommand $command, Device $device, int $issuedAt): void
    {
        try {
            broadcast(new CommandRelayed($command->session_id, self::envelope($command, $device, $issuedAt)));
        } catch (Throwable $e) {
            Log::error('relay broadcast failed', ['session_id' => $command->session_id, 'command_id' => $command->command_id, 'error' => $e->getMessage()]);
            throw ApiException::relayUnavailable();
        }
        if ($command->status === SessionCommand::STATUS_PENDING) {
            $command->forceFill(['status' => SessionCommand::STATUS_RELAYED])->save();
        }
    }

    /** @return array<string, mixed> the 04 §3.1 envelope */
    public static function envelope(SessionCommand $command, Device $issuer, int $issuedAt): array
    {
        return [
            'v' => 1,
            'type' => 'command',
            'sessionId' => $command->session_id,
            'commandId' => $command->command_id,
            'seq' => $command->seq,
            'name' => $command->name,
            'payload' => $command->payload === [] ? new \stdClass : $command->payload,
            'baseRevision' => $command->base_revision,
            'issuer' => ['deviceId' => $issuer->id, 'role' => $issuer->role],
            'issuedAt' => $issuedAt,
            'relayedAt' => $command->relayed_at->getTimestampMs(),
        ];
    }

    /**
     * Stores the snapshot if it is newer (or a new epoch), applies the acks to the command log, and
     * broadcasts it to the controllers. An older snapshot is still broadcast when it carries acks.
     *
     * @param  array<string, mixed>  $body
     * @return array{accepted: true, stored: bool}
     */
    public function acceptSnapshot(Device $device, PresentationSession $session, array $body): array
    {
        $acks = $body['acks'] ?? [];
        $stored = DB::transaction(function () use ($session, $body, $acks) {
            $locked = PresentationSession::query()->lockForUpdate()->findOrFail($session->id);
            $newer = $locked->last_presentation_id !== $body['presentationId']
                || $locked->last_revision === null
                || $body['revision'] >= $locked->last_revision;

            $snapshot = $body;
            unset($snapshot['acks']);
            $fill = ['last_activity_at' => now()];
            if ($newer) {
                $fill += [
                    'last_snapshot' => $snapshot,
                    'last_presentation_id' => $body['presentationId'],
                    'last_revision' => $body['revision'],
                    'last_snapshot_at' => now(),
                ];
            }
            $locked->forceFill($fill)->save();
            $this->applyAcks($session, $acks);

            return $newer;
        });

        if ($stored || $acks !== []) {
            SafeBroadcast::send(new StateUpdated($session->id, self::stateEvent($session->id, $body)), ['session_id' => $session->id]);
        }

        return ['accepted' => true, 'stored' => $stored];
    }

    /** @param list<array{commandId: string, result: string, code?: ?string}> $acks */
    private function applyAcks(PresentationSession $session, array $acks): void
    {
        foreach ($acks as $ack) {
            $status = match ($ack['result']) {
                'APPLIED' => SessionCommand::STATUS_APPLIED,
                'REJECTED' => SessionCommand::STATUS_REJECTED,
                default => null,
            };
            $q = SessionCommand::query()->where('session_id', $session->id)->where('command_id', $ack['commandId']);
            if ($status !== null) {
                $q->update(['status' => $status, 'result_code' => $ack['code'] ?? null, 'acked_at' => now()]);
            } else {
                // DUPLICATE: the Display had already answered; only settle rows that are still open.
                $q->whereIn('status', [SessionCommand::STATUS_PENDING, SessionCommand::STATUS_RELAYED])
                    ->update(['status' => SessionCommand::STATUS_DUPLICATE, 'acked_at' => now()]);
            }
        }
    }

    /** @return array<string, mixed> the 04 §3.2 `.state` payload */
    public static function stateEvent(string $sessionId, array $body): array
    {
        return [
            'v' => 1,
            'type' => 'state',
            'sessionId' => $sessionId,
            'presentationId' => $body['presentationId'],
            'revision' => $body['revision'],
            'capturedAtWall' => $body['capturedAtWall'],
            'state' => $body['state'],
            'computed' => $body['computed'],
            'lastEvents' => $body['lastEvents'] ?? [],
            'acks' => $body['acks'] ?? [],
        ];
    }
}
