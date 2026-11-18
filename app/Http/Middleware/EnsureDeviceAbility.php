<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Modules\Sessions\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** `ability:display` / `ability:controller` — the token must carry one of the abilities. */
class EnsureDeviceAbility
{
    public function handle(Request $request, Closure $next, string ...$abilities): Response
    {
        $device = $request->user();
        if (! $device instanceof Device) {
            throw ApiException::forbiddenRole();
        }
        foreach ($abilities as $ability) {
            if ($device->tokenCan($ability) && $device->role === $ability) {
                return $next($request);
            }
        }

        throw ApiException::forbiddenRole();
    }
}
