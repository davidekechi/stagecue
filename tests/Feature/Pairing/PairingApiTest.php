<?php

use App\Modules\Pairing\Services\PairingService;
use App\Modules\Relay\Events\ControllerPaired;
use App\Modules\Relay\Events\ControllerRevoked;
use App\Modules\Sessions\Models\PresentationSession;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;

beforeEach(fn () => RateLimiter::clear('pairing-min:127.0.0.1'));

it('BE-02 pairs by code and by token; a code is single-use', function () {
    Event::fake([ControllerPaired::class, ControllerRevoked::class]);
    $d = createDisplay();
    $c = pairController($d, "Dave's iPhone");

    expect($c['body']['device']['role'])->toBe('controller')
        ->and($c['body']['session'])->toBe(['id' => $d['session'], 'displayName' => 'Main Hall TV'])
        ->and($c['body'])->toHaveKeys(['realtime', 'serverTime']);
    asDevice($c['token'])->getJson("/api/sessions/{$d['session']}")->assertOk();
    Event::assertDispatched(ControllerPaired::class, fn ($e) => $e->name === "Dave's iPhone" && $e->sessionId === $d['session']);

    app('auth')->forgetGuards();
    $this->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'Again'])->assertNotFound()->assertJsonPath('error.code', 'PAIRING_INVALID');

    $d2 = createDisplay();
    $this->postJson('/api/pairings', ['token' => $d2['pairingToken'], 'deviceName' => 'QR phone'])->assertCreated();
    $this->postJson('/api/pairings', ['token' => $d2['pairingToken'], 'deviceName' => 'QR phone'])->assertNotFound();
});

it('accepts lower-case codes', function () {
    $d = createDisplay();
    $this->postJson('/api/pairings', ['code' => strtolower($d['code']), 'deviceName' => 'p'])->assertCreated();
});

it('validates exactly one of code | token', function () {
    $this->postJson('/api/pairings', ['deviceName' => 'p'])->assertUnprocessable();
    $this->postJson('/api/pairings', ['code' => 'ABC234', 'token' => str_repeat('a', 43), 'deviceName' => 'p'])->assertUnprocessable();
    $this->postJson('/api/pairings', ['code' => 'ABC10O', 'deviceName' => 'p'])->assertUnprocessable(); // ambiguous characters
    $this->postJson('/api/pairings', ['code' => 'ABC234'])->assertUnprocessable();
});

it('BE-03 an expired pairing → 410', function () {
    $d = createDisplay();
    $this->travel(11)->minutes();
    $this->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'p'])->assertStatus(410)->assertJsonPath('error.code', 'PAIRING_EXPIRED');
});

it('BE-04 a new pairing replaces the previous controller', function () {
    Event::fake([ControllerPaired::class, ControllerRevoked::class]);
    $d = createDisplay();
    $old = pairController($d);
    $code = asDevice($d['token'])->postJson("/api/sessions/{$d['session']}/pairing/regenerate")->assertOk()->json('pairing.code');
    $new = pairController(['code' => $code]);

    asDevice($old['token'])->getJson("/api/sessions/{$d['session']}")->assertUnauthorized();
    asDevice($new['token'])->getJson("/api/sessions/{$d['session']}")->assertOk();
    Event::assertDispatched(ControllerRevoked::class, fn ($e) => $e->deviceId === $old['device'] && $e->reason === 'replaced');
    expect(PresentationSession::find($d['session'])->activeController->id)->toBe($new['device']);
});

it('regenerate invalidates the previous code', function () {
    $d = createDisplay();
    $p = asDevice($d['token'])->postJson("/api/sessions/{$d['session']}/pairing/regenerate")->assertOk()->json('pairing');
    expect($p['code'])->not->toBe($d['code'])->and($p)->toHaveKeys(['code', 'token', 'expiresAt', 'url']);
    app('auth')->forgetGuards();
    $this->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'p'])->assertNotFound();
    $this->postJson('/api/pairings', ['token' => $d['pairingToken'], 'deviceName' => 'p'])->assertNotFound();
});

it('BE-05 the 6th pairing attempt in a minute from one IP → 429', function () {
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/pairings', ['code' => 'ZZZZZZ', 'deviceName' => 'p'])->assertNotFound();
    }
    $this->postJson('/api/pairings', ['code' => 'ZZZZZZ', 'deviceName' => 'p'])
        ->assertStatus(429)
        ->assertJsonPath('error.code', 'RATE_LIMITED')
        ->assertJsonPath('error.retryable', true)
        ->assertHeader('Retry-After');
});

it('BE-06 20 failed attempts rotate the live code out', function () {
    $d = createDisplay();
    $service = app(PairingService::class);
    for ($i = 0; $i < 19; $i++) {
        $service->recordFailure();
    }
    expect(PresentationSession::find($d['session'])->pairing_code)->toBe($d['code']);
    $service->recordFailure();
    expect(PresentationSession::find($d['session'])->pairing_code)->toBeNull();
    $this->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'p'])->assertNotFound();
});

it('does not pair into an ended session', function () {
    $d = createDisplay();
    PresentationSession::query()->whereKey($d['session'])->update(['status' => 'ended']);
    $this->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'p'])->assertNotFound();
});

it('draws codes from the unambiguous alphabet', function () {
    $session = PresentationSession::factory()->create();
    $codes = collect(range(1, 50))->map(fn () => app(PairingService::class)->issue($session)->code);
    expect($codes->every(fn ($c) => preg_match('/^[2-9A-HJKMNP-Z]{6}$/', $c) === 1))->toBeTrue()
        ->and($codes->unique()->count())->toBeGreaterThan(45);
});
