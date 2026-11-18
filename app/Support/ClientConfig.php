<?php

declare(strict_types=1);

namespace App\Support;

/** 06-Deployment §4 — the runtime (not build-time) client configuration. Contains no secrets. */
final class ClientConfig
{
    /** @return array{key: ?string, host: ?string, port: int, scheme: string, heartbeatMode: string, staleMs: int} */
    public static function realtime(): array
    {
        return [
            'key' => config('broadcasting.connections.reverb.key'),
            'host' => config('stagecue.reverb_client.host'),
            'port' => (int) config('stagecue.reverb_client.port'),
            'scheme' => (string) config('stagecue.reverb_client.scheme'),
            'heartbeatMode' => (string) config('stagecue.heartbeat_mode'),
            'staleMs' => (int) config('stagecue.command_stale_ms'),
        ];
    }

    /** The `<script id="stagecue-config">` payload in app.blade.php. */
    public static function forShell(): array
    {
        $r = self::realtime();

        return [
            'reverb' => ['key' => $r['key'], 'host' => $r['host'], 'port' => $r['port'], 'scheme' => $r['scheme']],
            'heartbeatMode' => $r['heartbeatMode'],
            'staleMs' => $r['staleMs'],
        ];
    }
}
