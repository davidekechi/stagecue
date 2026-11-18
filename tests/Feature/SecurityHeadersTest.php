<?php

use App\Http\Middleware\SecurityHeaders;
use App\Modules\Relay\Events\CommandRelayed;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

beforeEach(fn () => $this->withoutVite());

it('T9.3 sets the security headers on the shell and the API', function () {
    config(['stagecue.reverb_client' => ['host' => 'ws.example.test', 'port' => 443, 'scheme' => 'https']]);
    foreach (['/display', '/api/time'] as $url) {
        $r = $this->get($url);
        $r->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('Permissions-Policy');
        expect($r->headers->get('Permissions-Policy'))->toContain('camera=(self)')->toContain('screen-wake-lock=(self)')->toContain('window-management=(self)');
        $csp = $r->headers->get('Content-Security-Policy');
        expect($csp)->toContain("default-src 'self'")
            ->toContain("script-src 'self'")
            ->toContain("connect-src 'self' wss://ws.example.test")
            ->toContain("frame-ancestors 'none'")
            ->not->toContain('unsafe-eval');
    }
});

it('sends HSTS over HTTPS only', function () {
    $this->get('/display')->assertHeaderMissing('Strict-Transport-Security');
    $this->get('https://localhost/display')->assertHeader('Strict-Transport-Security', 'max-age=31536000');
});

it('includes a non-standard Reverb port in connect-src', function () {
    config(['stagecue.reverb_client' => ['host' => 'localhost', 'port' => 8080, 'scheme' => 'http']]);
    expect(SecurityHeaders::contentSecurityPolicy())->toContain("connect-src 'self' ws://localhost:8080");
});

it('never logs tokens or message text', function () {
    Event::fake([CommandRelayed::class]);
    Log::spy();
    $d = createDisplay();
    $c = pairController($d);
    asDevice($c['token'])->postJson("/api/sessions/{$d['session']}/commands", [
        'v' => 1, 'commandId' => (string) Str::uuid7(), 'name' => 'MESSAGE_SHOW', 'baseRevision' => null, 'issuedAt' => 1,
        'payload' => ['id' => (string) Str::uuid7(), 'text' => 'Secret announcement', 'mode' => 'persistent'],
    ])->assertStatus(202);

    Log::shouldHaveReceived('info')->withArgs(function (string $message, array $context) use ($c) {
        $flat = json_encode($context);

        return ! str_contains($flat, 'Secret announcement')
            && ! str_contains($flat, explode('|', $c['token'])[1])
            && isset($context['command_id'], $context['relay_ms']);
    });
});
