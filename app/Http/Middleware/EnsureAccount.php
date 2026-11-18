<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/** `account` — the bearer token must be a logged-in StageCue account (not a device). Slides its expiry. */
class EnsureAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user instanceof User || ! $user->tokenCan('account')) {
            throw ApiException::accountRequired();
        }
        $token = $user->currentAccessToken();
        if ($token instanceof PersonalAccessToken && $token->expires_at instanceof \DateTimeInterface
            && $token->expires_at->lt(now()->addDays((int) config('stagecue.token_renew_within_days')))) {
            $token->forceFill(['expires_at' => now()->addDays((int) config('stagecue.account_token_days'))])->save();
        }

        return $next($request);
    }
}
