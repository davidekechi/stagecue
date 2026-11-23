<?php

declare(strict_types=1);

namespace App\Modules\Pairing\Services;

use App\Exceptions\ApiException;
use App\Modules\Relay\Events\ControllerPaired;
use App\Modules\Relay\Events\ControllerRevoked;
use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use App\Support\SafeBroadcast;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;
use RuntimeException;

/** LLD §7.2 / HLD §12 — one-time pairing codes and QR tokens; one active controller (D11). */
class PairingService
{
    /** 31 characters, no 0/O/1/I/L (FR-S2). */
    public const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

    public const CODE_LENGTH = 6;

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public function issue(PresentationSession $session): PairingSecrets
    {
        $ttl = (int) config('stagecue.pairing_ttl_seconds');
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $code = $this->randomCode();
            $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
            $expires = now()->addSeconds($ttl);
            try {
                $session->forceFill([
                    'pairing_code' => $code,
                    'pairing_token_hash' => self::hashToken($token),
                    'pairing_expires_at' => $expires,
                    'pairing_failed_attempts' => 0,
                ])->save();
            } catch (UniqueConstraintViolationException) {
                continue; // a collision with another live code: draw again
            }

            return new PairingSecrets($code, $token, $expires->getTimestampMs(), rtrim((string) config('app.url'), '/').'/pair#t='.$token);
        }

        throw new RuntimeException('Could not allocate a unique pairing code.');
    }

    /** A24: the phone must be logged in to the same account as the Display that issued the code. */
    public function consume(?string $code, ?string $token, string $deviceName, ?string $userAgent, ?int $userId = null): PairResult
    {
        try {
            /** @var array{0: PairResult, 1: list<string>} $out */
            $out = DB::transaction(function () use ($code, $token, $deviceName, $userAgent, $userId) {
                $query = PresentationSession::query()->lockForUpdate();
                $session = $code !== null
                    ? $query->where('pairing_code', strtoupper($code))->first()
                    : $query->where('pairing_token_hash', self::hashToken((string) $token))->first();

                if (! $session || $session->isEnded()) {
                    throw ApiException::pairingInvalid();
                }
                if ($session->pairing_expires_at === null || $session->pairing_expires_at->isPast()) {
                    throw ApiException::pairingExpired();
                }
                if ($session->user_id === null || $session->user_id !== $userId) {
                    throw ApiException::accountMismatch();
                }

                // A28: several phones may be paired; a new one no longer replaces the others.
                $paired = $session->devices()->where('role', Device::ROLE_CONTROLLER)->whereNull('revoked_at')->count();
                if ($paired >= (int) config('stagecue.max_controllers')) {
                    throw ApiException::controllerLimit((int) config('stagecue.max_controllers'));
                }
                $replaced = [];
                $session->forceFill([
                    'pairing_code' => null,
                    'pairing_token_hash' => null,
                    'pairing_expires_at' => null,
                    'pairing_failed_attempts' => 0,
                    'last_activity_at' => now(),
                ])->save();

                $device = $session->devices()->create([
                    'role' => Device::ROLE_CONTROLLER,
                    'name' => $deviceName,
                    'user_agent' => $userAgent !== null ? mb_substr($userAgent, 0, 255) : null,
                    'last_seen_at' => now(),
                ]);
                $plain = $device->createToken('controller', ['controller'], now()->addDays((int) config('stagecue.controller_token_days')))->plainTextToken;

                return [new PairResult($session, $device, $plain), $replaced];
            });
        } catch (ApiException $e) {
            if (in_array($e->errorCode, ['PAIRING_INVALID', 'ACCOUNT_MISMATCH'], true) && $code !== null) {
                $this->recordFailure();
            }
            throw $e;
        }

        [$result, $replaced] = $out;
        foreach ($replaced as $oldId) {
            SafeBroadcast::send(new ControllerRevoked($result->session->id, $oldId, 'replaced'), ['session_id' => $result->session->id]);
        }
        SafeBroadcast::send(
            new ControllerPaired($result->session->id, $result->device->id, $result->device->name, $result->device->created_at?->getTimestampMs() ?? now()->getTimestampMs()),
            ['session_id' => $result->session->id],
        );

        return $result;
    }

    /** Display unpairs one phone (`$only`) or all of them, or a phone leaves. */
    public function revokeController(PresentationSession $session, string $reason, ?Device $only = null): void
    {
        $ids = DB::transaction(fn () => $this->revokeControllersQuietly($session, $only));
        foreach ($ids as $id) {
            SafeBroadcast::send(new ControllerRevoked($session->id, $id, $reason), ['session_id' => $session->id]);
        }
    }

    /**
     * Failed code guesses cannot be attributed to one session, so each failure counts against every
     * live code; a session whose counter reaches the limit has its secrets rotated out (ambiguity log A17).
     */
    public function recordFailure(): void
    {
        $max = (int) config('stagecue.pairing_max_failures');
        PresentationSession::query()
            ->whereNotNull('pairing_code')
            ->where('pairing_expires_at', '>', now())
            ->increment('pairing_failed_attempts');
        PresentationSession::query()
            ->whereNotNull('pairing_code')
            ->where('pairing_failed_attempts', '>=', $max)
            ->update(['pairing_code' => null, 'pairing_token_hash' => null, 'pairing_expires_at' => null]);
    }

    /** @return list<string> the revoked controller ids */
    private function revokeControllersQuietly(PresentationSession $session, ?Device $only = null): array
    {
        $controllers = $session->devices()
            ->where('role', Device::ROLE_CONTROLLER)
            ->whereNull('revoked_at')
            ->when($only, fn ($q) => $q->whereKey($only->id))
            ->pluck('id')
            ->all();
        if ($controllers === []) {
            return [];
        }
        Device::query()->whereKey($controllers)->update(['revoked_at' => now()]);
        PersonalAccessToken::query()->where('tokenable_type', Device::class)->whereIn('tokenable_id', $controllers)->delete();

        return array_values($controllers);
    }

    private function randomCode(): string
    {
        $out = '';
        $max = strlen(self::ALPHABET) - 1;
        for ($i = 0; $i < self::CODE_LENGTH; $i++) {
            $out .= self::ALPHABET[random_int(0, $max)];
        }

        return $out;
    }
}
