<?php

use App\Modules\Relay\Events\ControllerRevoked;
use App\Modules\Relay\Events\SessionEnded;
use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use Illuminate\Support\Facades\Event;

it('BE-01 creates a session: 201, a working token, a pairing code and expiry', function () {
    $this->freezeTime();
    $d = createDisplay();
    $body = $d['body'];

    expect($body['session'])->toMatchArray(['displayName' => 'Main Hall TV', 'status' => 'active'])
        ->and($body['device']['role'])->toBe('display')
        ->and($body['pairing']['code'])->toMatch('/^[2-9A-HJKMNP-Z]{6}$/')
        ->and($body['pairing']['token'])->toHaveLength(43)
        ->and($body['pairing']['expiresAt'])->toBe(now()->addMinutes(10)->getTimestampMs())
        ->and($body['pairing']['url'])->toEndWith('/pair#t='.$body['pairing']['token'])
        ->and($body['realtime'])->toHaveKeys(['key', 'host', 'port', 'scheme', 'heartbeatMode', 'staleMs'])
        ->and($body['serverTime'])->toBe(now()->getTimestampMs());

    asDevice($d['token'])->getJson("/api/sessions/{$d['session']}")
        ->assertOk()
        ->assertJsonPath('device.role', 'display')
        ->assertJsonPath('controller', null)
        ->assertJsonPath('pairing.code', $d['code']);

    $session = PresentationSession::find($d['session']);
    expect($session->pairing_token_hash)->toBe(hash('sha256', $d['pairingToken']))
        ->and($session->displayDevice->tokens()->first()->expires_at->diffInDays(now(), true))->toBeGreaterThan(89.99)->toBeLessThanOrEqual(90.0);
});

it('defaults the display name and validates it', function () {
    $this->postJson('/api/sessions', [])->assertCreated()->assertJsonPath('session.displayName', 'Display');
    $this->postJson('/api/sessions', ['displayName' => str_repeat('x', 61)])->assertUnprocessable();
});

it('shows the controller to the display, and hides pairing from the controller', function () {
    $d = createDisplay();
    $c = pairController($d, "Dave's iPhone");

    asDevice($d['token'])->getJson("/api/sessions/{$d['session']}")
        ->assertJsonPath('controller.name', "Dave's iPhone")
        ->assertJsonPath('pairing', null); // consumed
    asDevice($c['token'])->getJson("/api/sessions/{$d['session']}")
        ->assertOk()
        ->assertJsonPath('device.role', 'controller')
        ->assertJsonPath('pairing', null);
});

it('BE-14 ends the session: 204, session.ended broadcast, every token revoked', function () {
    Event::fake([SessionEnded::class]);
    $d = createDisplay();
    $c = pairController($d);

    asDevice($c['token'])->deleteJson("/api/sessions/{$d['session']}")->assertForbidden()->assertJsonPath('error.code', 'FORBIDDEN_ROLE');
    asDevice($d['token'])->deleteJson("/api/sessions/{$d['session']}")->assertNoContent();

    Event::assertDispatched(SessionEnded::class, fn ($e) => $e->sessionId === $d['session']);
    expect(PresentationSession::find($d['session'])->status)->toBe('ended')
        ->and(Device::query()->whereNull('revoked_at')->count())->toBe(0);
    asDevice($d['token'])->getJson("/api/sessions/{$d['session']}")->assertUnauthorized();
    asDevice($c['token'])->getJson("/api/sessions/{$d['session']}")->assertUnauthorized();
});

it('BE-14 the display revokes the controller; a controller can leave', function () {
    Event::fake([ControllerRevoked::class]);
    $d = createDisplay();
    $c = pairController($d);

    asDevice($d['token'])->deleteJson("/api/sessions/{$d['session']}/controller")->assertNoContent();
    Event::assertDispatched(ControllerRevoked::class, fn ($e) => $e->deviceId === $c['device'] && $e->reason === 'revoked_by_display');
    asDevice($c['token'])->getJson("/api/sessions/{$d['session']}")->assertUnauthorized();

    asDevice($d['token'])->postJson("/api/sessions/{$d['session']}/pairing/regenerate")->assertOk();
    $code = PresentationSession::find($d['session'])->pairing_code;
    $c2 = pairController(['code' => $code]);
    asDevice($d['token'])->deleteJson("/api/sessions/{$d['session']}/controller/self")->assertForbidden();
    asDevice($c2['token'])->deleteJson("/api/sessions/{$d['session']}/controller/self")->assertNoContent();
    Event::assertDispatched(ControllerRevoked::class, fn ($e) => $e->deviceId === $c2['device'] && $e->reason === 'left');
    asDevice($c2['token'])->getJson("/api/sessions/{$d['session']}")->assertUnauthorized();
});

it('touches last_activity_at at most once a minute', function () {
    $d = createDisplay();
    $this->travel(2)->minutes();
    asDevice($d['token'])->getJson("/api/sessions/{$d['session']}")->assertOk();
    $first = PresentationSession::find($d['session'])->last_activity_at;
    expect($first->diffInSeconds(now(), true))->toBeLessThan(2);
    $this->travel(30)->seconds();
    asDevice($d['token'])->getJson("/api/sessions/{$d['session']}")->assertOk();
    expect(PresentationSession::find($d['session'])->last_activity_at->eq($first))->toBeTrue();
});
