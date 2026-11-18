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
 * Also slides a controller token's expiry (7 days, renewed when < 24 h remain).
 */
class EnsureSessionMember
{
    public const CONTROLLER_TOKEN_DAYS = 7;

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
        $this->slideControllerToken($device);

        return $next($request);
    }

    private function slideControllerToken(Device $device): void
    {
        $token = $device->currentAccessToken();
        if (! $device->isController() || ! $token instanceof PersonalAccessToken || $token->expires_at === null) {
            return;
        }
        if ($token->expires_at->lt(now()->addDay())) {
            $token->forceFill(['expires_at' => now()->addDays(self::CONTROLLER_TOKEN_DAYS)])->save();
        }
    }
}
