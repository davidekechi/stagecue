<?php

return [
    'pairing_ttl_seconds' => (int) env('STAGECUE_PAIRING_TTL_SECONDS', 600),
    'pairing_max_failures' => 20,
    'command_stale_ms' => (int) env('STAGECUE_COMMAND_STALE_MS', 10000),
    // `whisper` (D6 default) or `http` (fallback, LLD §6.4) — decided by spike T0.3.
    'heartbeat_mode' => env('STAGECUE_HEARTBEAT_MODE', 'whisper'),
    // A21: pairing persists until someone unpairs on purpose. Tokens slide on every use.
    'display_token_days' => 90,
    'controller_token_days' => 90,
    'token_renew_within_days' => 14,
    // A session nobody has used for this long is ended (then deleted 30 days later).
    'session_idle_days' => 90,
    'snapshot_max_bytes' => 16384,

    // A24: anyone with the link can create an account while this is `open`; `closed` turns sign-up off.
    'registration' => env('STAGECUE_REGISTRATION', 'open'),
    // A24: the Sign up page is hidden (`/signup` and `?mode=register` go to Log in) unless this is `shown`.
    'signup_page' => env('STAGECUE_SIGNUP_PAGE', 'hidden'),
    'account_token_days' => 90,

    // LLD §7.3 rate limits (per minute unless noted).
    'throttle' => [
        'session_create' => (int) env('STAGECUE_THROTTLE_SESSION_CREATE', 10),
        'pairing_minute' => (int) env('STAGECUE_THROTTLE_PAIRING_MINUTE', 5),
        'pairing_hour' => (int) env('STAGECUE_THROTTLE_PAIRING_HOUR', 20),
        'commands' => (int) env('STAGECUE_THROTTLE_COMMANDS', 60),
        'snapshots' => (int) env('STAGECUE_THROTTLE_SNAPSHOTS', 120),
        'heartbeat' => (int) env('STAGECUE_THROTTLE_HEARTBEAT', 30),
        'login' => (int) env('STAGECUE_THROTTLE_LOGIN', 10),
        'register' => (int) env('STAGECUE_THROTTLE_REGISTER', 5),
    ],

    // The WebSocket endpoint the BROWSER connects to. Defaults to the server-side Reverb settings.
    'reverb_client' => [
        'host' => env('STAGECUE_REVERB_CLIENT_HOST', env('REVERB_HOST')),
        'port' => (int) env('STAGECUE_REVERB_CLIENT_PORT', env('REVERB_PORT', 443)),
        'scheme' => env('STAGECUE_REVERB_CLIENT_SCHEME', env('REVERB_SCHEME', 'https')),
    ],
];
