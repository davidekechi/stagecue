<?php

declare(strict_types=1);

namespace App\Modules\Sessions\Services;

use App\Modules\Pairing\Services\PairingService;
use App\Modules\Relay\Events\SessionEnded;
use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use App\Support\SafeBroadcast;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

class SessionService
{
    public const TOUCH_THROTTLE_SECONDS = 60;

    public function __construct(private readonly PairingService $pairing) {}

    public function create(string $displayName, ?string $userAgent, ?int $userId = null): CreatedSession
    {
        return DB::transaction(function () use ($displayName, $userAgent, $userId) {
            $session = PresentationSession::query()->create([
                'user_id' => $userId,
                'display_name' => $displayName,
                'status' => PresentationSession::STATUS_ACTIVE,
                'last_activity_at' => now(),
            ]);
            $device = $session->devices()->create([
                'role' => Device::ROLE_DISPLAY,
                'name' => $displayName,
                'user_agent' => $userAgent !== null ? mb_substr($userAgent, 0, 255) : null,
                'last_seen_at' => now(),
            ]);
            $token = $device->createToken('display', ['display'], now()->addDays((int) config('stagecue.display_token_days')))->plainTextToken;

            return new CreatedSession($session, $device, $token, $this->pairing->issue($session));
        });
    }

    /** Broadcasts `session.ended`, then revokes every device and token (04 §1.3). */
    public function end(PresentationSession $session): void
    {
        $endedAt = now();
        $session->forceFill([
            'status' => PresentationSession::STATUS_ENDED,
            'ended_at' => $endedAt,
            'pairing_code' => null,
            'pairing_token_hash' => null,
            'pairing_expires_at' => null,
        ])->save();
        SafeBroadcast::send(new SessionEnded($session->id, $endedAt->getTimestampMs()), ['session_id' => $session->id]);

        $ids = $session->devices()->pluck('id')->all();
        Device::query()->whereKey($ids)->whereNull('revoked_at')->update(['revoked_at' => $endedAt]);
        PersonalAccessToken::query()->where('tokenable_type', Device::class)->whereIn('tokenable_id', $ids)->delete();
    }

    /** Records activity, at most once per minute. */
    public function touch(PresentationSession $session): void
    {
        if ($session->last_activity_at === null || $session->last_activity_at->lt(now()->subSeconds(self::TOUCH_THROTTLE_SECONDS))) {
            $session->forceFill(['last_activity_at' => now()])->save();
        }
    }
}
