<?php

return [
    'pairing_ttl_seconds' => (int) env('STAGECUE_PAIRING_TTL_SECONDS', 600),
    'pairing_max_failures' => 20,
    'command_stale_ms' => (int) env('STAGECUE_COMMAND_STALE_MS', 10000),
    // `whisper` (D6 default) or `http` (fallback, LLD §6.4) — decided by spike T0.3.
    'heartbeat_mode' => env('STAGECUE_HEARTBEAT_MODE', 'whisper'),
    'display_token_days' => 30,
    'controller_token_days' => 7,
    'snapshot_max_bytes' => 16384,

    // LLD §7.3 rate limits (per minute unless noted).
    'throttle' => [
        'session_create' => (int) env('STAGECUE_THROTTLE_SESSION_CREATE', 10),
        'pairing_minute' => (int) env('STAGECUE_THROTTLE_PAIRING_MINUTE', 5),
        'pairing_hour' => (int) env('STAGECUE_THROTTLE_PAIRING_HOUR', 20),
        'commands' => (int) env('STAGECUE_THROTTLE_COMMANDS', 60),
        'snapshots' => (int) env('STAGECUE_THROTTLE_SNAPSHOTS', 120),
        'heartbeat' => (int) env('STAGECUE_THROTTLE_HEARTBEAT', 30),
    ],

    // The WebSocket endpoint the BROWSER connects to. Defaults to the server-side Reverb settings.
    'reverb_client' => [
        'host' => env('STAGECUE_REVERB_CLIENT_HOST', env('REVERB_HOST')),
        'port' => (int) env('STAGECUE_REVERB_CLIENT_PORT', env('REVERB_PORT', 443)),
        'scheme' => env('STAGECUE_REVERB_CLIENT_SCHEME', env('REVERB_SCHEME', 'https')),
    ],
];
