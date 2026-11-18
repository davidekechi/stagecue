<?php

beforeEach(fn () => $this->withoutVite());

it('renders the runtime client config in the shell, without secrets', function () {
    config([
        'broadcasting.connections.reverb.key' => 'public-key',
        'broadcasting.connections.reverb.secret' => 'TOP-SECRET',
        'broadcasting.connections.reverb.app_id' => 'APP-ID-123',
        'stagecue.reverb_client' => ['host' => 'ws.example.test', 'port' => 443, 'scheme' => 'https'],
        'stagecue.heartbeat_mode' => 'http',
    ]);
    $html = $this->get('/display')->assertOk()->getContent();

    preg_match('#<script id="stagecue-config" type="application/json">(.*?)</script>#s', $html, $m);
    $config = json_decode($m[1] ?? 'null', true);

    expect($config)->toBe([
        'reverb' => ['key' => 'public-key', 'host' => 'ws.example.test', 'port' => 443, 'scheme' => 'https'],
        'heartbeatMode' => 'http',
        'staleMs' => 10000,
    ])->and($html)->not->toContain('TOP-SECRET')->and($html)->not->toContain('APP-ID-123');
});

it('returns the same realtime block from the session API', function () {
    config(['stagecue.heartbeat_mode' => 'whisper']);
    asDevice(accountToken())->postJson('/api/sessions', [])->assertCreated()->assertJsonPath('realtime.heartbeatMode', 'whisper')->assertJsonMissingPath('realtime.secret');
});
