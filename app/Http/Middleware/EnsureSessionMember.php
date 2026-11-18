<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * LLD §7.3 — the device must belong to {session} and not be revoked; an ended session is 410.
 * Also slides the device token's expiry on use (A21: pairing persists until someone unpairs).
 */
class EnsureSessionMember
{
    public function handle(Request $request, Closure $next): Response
    {
        $device = $request->user();
        $param = $request->route('session');
        $session = $param instanceof PresentationSession ? $param : PresentationSession::query()->find($param);

        if (! $session) {
            throw ApiException::sessionNotFound();
        }
        if (! $device instanceof Device || $device->session_id !== $session->id || $device->isRevoked()) {
            throw ApiException::notMember();
        }
        if ($session->isEnded()) {
            throw ApiException::sessionEnded();
        }

        $request->route()?->setParameter('session', $session);
        $this->slideToken($device);

        return $next($request);
    }

    private function slideToken(Device $device): void
    {
        $token = $device->currentAccessToken();
        if (! $token instanceof PersonalAccessToken || ! $token->expires_at instanceof \DateTimeInterface) {
            return;
        }
        if ($token->expires_at->lt(now()->addDays((int) config('stagecue.token_renew_within_days')))) {
            $days = (int) config($device->isController() ? 'stagecue.controller_token_days' : 'stagecue.display_token_days');
            $token->forceFill(['expires_at' => now()->addDays($days)])->save();
        }
    }
}
