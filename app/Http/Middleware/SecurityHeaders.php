<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

/** 06-Deployment §5 — security headers on every response. */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $h = $response->headers;

        $h->set('X-Content-Type-Options', 'nosniff');
        // Protects the pairing URL fragment and anything else from leaking through Referer.
        $h->set('Referrer-Policy', 'no-referrer');
        $h->set('Permissions-Policy', 'camera=(self), fullscreen=(self), screen-wake-lock=(self), window-management=(self), microphone=(), geolocation=()');
        if ($request->isSecure()) {
            $h->set('Strict-Transport-Security', 'max-age=31536000');
        }
        // The Vite dev server injects scripts and an HMR socket from another origin: no CSP while it runs.
        if (! (app()->environment('local') && Vite::isRunningHot())) {
            $h->set('Content-Security-Policy', self::contentSecurityPolicy());
        }

        return $response;
    }

    public static function contentSecurityPolicy(): string
    {
        $host = (string) config('stagecue.reverb_client.host');
        $port = (int) config('stagecue.reverb_client.port');
        $secure = config('stagecue.reverb_client.scheme') === 'https';
        $ws = $host !== '' ? ($secure ? 'wss://' : 'ws://').$host.(in_array($port, [80, 443], true) ? '' : ':'.$port) : '';

        return implode('; ', array_filter([
            "default-src 'self'",
            "script-src 'self'",
            // Vue sets inline style properties (timer transform, transitions).
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            trim("connect-src 'self' {$ws}"),
            "worker-src 'self' blob:",
            "manifest-src 'self'",
            "media-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]));
    }
}
