<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** LLD §6.5 — every API response carries the server clock for offset estimation. */
class AddServerTime
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        if ($request->is('api/*') || $request->is('api')) {
            $response->headers->set('X-Server-Time', (string) now()->getTimestampMs());
            $response->headers->set('Access-Control-Expose-Headers', 'X-Server-Time');
        }

        return $response;
    }
}
