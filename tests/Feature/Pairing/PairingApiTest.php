<?php

use App\Modules\Pairing\Services\PairingService;
use App\Modules\Relay\Events\ControllerPaired;
use App\Modules\Relay\Events\ControllerRevoked;
use App\Modules\Sessions\Models\PresentationSession;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

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
    asDevice(accountToken())->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'Again'])->assertNotFound()->assertJsonPath('error.code', 'PAIRING_INVALID');

    $d2 = createDisplay();
    asDevice(accountToken())->postJson('/api/pairings', ['token' => $d2['pairingToken'], 'deviceName' => 'QR phone'])->assertCreated();
    asDevice(accountToken())->postJson('/api/pairings', ['token' => $d2['pairingToken'], 'deviceName' => 'QR phone'])->assertNotFound();
});

it('accepts lower-case codes', function () {
    $d = createDisplay();
    asDevice(accountToken())->postJson('/api/pairings', ['code' => strtolower($d['code']), 'deviceName' => 'p'])->assertCreated();
});

it('validates exactly one of code | token', function () {
    asDevice(accountToken())->postJson('/api/pairings', ['deviceName' => 'p'])->assertUnprocessable();
    asDevice(accountToken())->postJson('/api/pairings', ['code' => 'ABC234', 'token' => str_repeat('a', 43), 'deviceName' => 'p'])->assertUnprocessable();
    asDevice(accountToken())->postJson('/api/pairings', ['code' => 'ABC10O', 'deviceName' => 'p'])->assertUnprocessable(); // ambiguous characters
    asDevice(accountToken())->postJson('/api/pairings', ['code' => 'ABC234'])->assertUnprocessable();
});

it('BE-03 an expired pairing → 410', function () {
    $d = createDisplay();
    $this->travel(11)->minutes();
    asDevice(accountToken())->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'p'])->assertStatus(410)->assertJsonPath('error.code', 'PAIRING_EXPIRED');
});

it('BE-04 / A28 a new pairing keeps the phones already paired', function () {
    Event::fake([ControllerPaired::class, ControllerRevoked::class]);
    $d = createDisplay();
    $first = pairController($d);
    $code = asDevice($d['token'])->postJson("/api/sessions/{$d['session']}/pairing/regenerate")->assertOk()->json('pairing.code');
    $second = pairController(['code' => $code, 'account' => $d['account']], 'Second phone');

    asDevice($first['token'])->getJson("/api/sessions/{$d['session']}")->assertOk();
    asDevice($second['token'])->getJson("/api/sessions/{$d['session']}")->assertOk();
    Event::assertNotDispatched(ControllerRevoked::class);
    Event::assertDispatchedTimes(ControllerPaired::class, 2);

    $info = asDevice($d['token'])->getJson("/api/sessions/{$d['session']}")->assertOk()->json();
    expect(array_column($info['controllers'], 'id'))->toBe([$first['device'], $second['device']]);
    expect($info['controllers'][1])->toHaveKeys(['id', 'name', 'pairedAt', 'lastSeenAt']);
    expect($info['controller']['id'])->toBe($second['device']); // older clients: the latest phone

    // Both phones can send commands.
    foreach ([$first, $second] as $phone) {
        asDevice($phone['token'])->postJson("/api/sessions/{$d['session']}/commands", [
            'v' => 1, 'commandId' => (string) Str::uuid7(), 'name' => 'TIMER_SET', 'baseRevision' => null, 'issuedAt' => now()->getTimestampMs(), 'payload' => ['durationMs' => 60000],
        ])->assertSuccessful();
    }
});

it('A28 limits how many phones can be paired, without using up the code', function () {
    config(['stagecue.max_controllers' => 2]);
    $d = createDisplay();
    $regen = fn () => asDevice($d['token'])->postJson("/api/sessions/{$d['session']}/pairing/regenerate")->assertOk()->json('pairing.code');
    pairController($d);
    pairController(['code' => $regen(), 'account' => $d['account']]);
    $code = $regen();
    asDevice($d['account'])->postJson('/api/pairings', ['code' => $code, 'deviceName' => 'Third'])
        ->assertStatus(409)->assertJsonPath('error.code', 'CONTROLLER_LIMIT');
    expect(PresentationSession::find($d['session'])->pairing_code)->toBe($code);
});

it('A28 the display can unpair one phone and keep the others', function () {
    Event::fake([ControllerPaired::class, ControllerRevoked::class]);
    $d = createDisplay();
    $first = pairController($d);
    $second = pairController(['code' => asDevice($d['token'])->postJson("/api/sessions/{$d['session']}/pairing/regenerate")->json('pairing.code'), 'account' => $d['account']]);

    asDevice($first['token'])->deleteJson("/api/sessions/{$d['session']}/controllers/{$second['device']}")->assertForbidden(); // phones can't remove each other
    asDevice($d['token'])->deleteJson("/api/sessions/{$d['session']}/controllers/{$first['device']}")->assertNoContent();
    asDevice($d['token'])->deleteJson("/api/sessions/{$d['session']}/controllers/{$first['device']}")->assertNoContent(); // idempotent

    asDevice($first['token'])->getJson("/api/sessions/{$d['session']}")->assertUnauthorized();
    asDevice($second['token'])->getJson("/api/sessions/{$d['session']}")->assertOk();
    Event::assertDispatched(ControllerRevoked::class, fn ($e) => $e->deviceId === $first['device'] && $e->reason === 'revoked_by_display');
    Event::assertDispatchedTimes(ControllerRevoked::class, 1);

    // "Unpair all" still removes every phone.
    asDevice($d['token'])->deleteJson("/api/sessions/{$d['session']}/controller")->assertNoContent();
    asDevice($second['token'])->getJson("/api/sessions/{$d['session']}")->assertUnauthorized();
});

it('regenerate invalidates the previous code', function () {
    $d = createDisplay();
    $p = asDevice($d['token'])->postJson("/api/sessions/{$d['session']}/pairing/regenerate")->assertOk()->json('pairing');
    expect($p['code'])->not->toBe($d['code'])->and($p)->toHaveKeys(['code', 'token', 'expiresAt', 'url']);
    app('auth')->forgetGuards();
    asDevice(accountToken())->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'p'])->assertNotFound();
    asDevice(accountToken())->postJson('/api/pairings', ['token' => $d['pairingToken'], 'deviceName' => 'p'])->assertNotFound();
});

it('BE-05 the 6th pairing attempt in a minute from one IP → 429', function () {
    for ($i = 0; $i < 5; $i++) {
        asDevice(accountToken())->postJson('/api/pairings', ['code' => 'ZZZZZZ', 'deviceName' => 'p'])->assertNotFound();
    }
    asDevice(accountToken())->postJson('/api/pairings', ['code' => 'ZZZZZZ', 'deviceName' => 'p'])
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
    asDevice(accountToken())->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'p'])->assertNotFound();
});

it('does not pair into an ended session', function () {
    $d = createDisplay();
    PresentationSession::query()->whereKey($d['session'])->update(['status' => 'ended']);
    asDevice(accountToken())->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'p'])->assertNotFound();
});

it('draws codes from the unambiguous alphabet', function () {
    $session = PresentationSession::factory()->create();
    $codes = collect(range(1, 50))->map(fn () => app(PairingService::class)->issue($session)->code);
    expect($codes->every(fn ($c) => preg_match('/^[2-9A-HJKMNP-Z]{6}$/', $c) === 1))->toBeTrue()
        ->and($codes->unique()->count())->toBeGreaterThan(45);
});
