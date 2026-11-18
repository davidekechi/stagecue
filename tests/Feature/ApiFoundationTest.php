<?php

use App\Exceptions\ApiException;
use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    Route::middleware(['api', 'auth:sanctum', 'session.member'])->prefix('api/test/{session}')->group(function () {
        Route::get('/member', fn (PresentationSession $session) => ['id' => $session->id]);
        Route::get('/display-only', fn () => ['ok' => true])->middleware('ability:display');
        Route::get('/controller-only', fn () => ['ok' => true])->middleware('ability:controller');
    });
    Route::middleware('api')->prefix('api/test')->group(function () {
        Route::get('/boom/{code}', function (string $code) {
            throw match ($code) {
                'relay' => ApiException::relayUnavailable(),
                'pairing-invalid' => ApiException::pairingInvalid(),
                'pairing-expired' => ApiException::pairingExpired(),
                default => new RuntimeException('secret detail'),
            };
        });
        Route::post('/validate', fn (Request $r) => $r->validate(['name' => 'required']));
    });
});

function tokenFor(Device $device, string $ability): string
{
    return $device->createToken($ability, [$ability], now()->addDays(30))->plainTextToken;
}

it('BE-16 every API response carries X-Server-Time, including errors', function () {
    $before = now()->getTimestampMs();
    $ok = $this->getJson('/api/time')->assertOk();
    expect((int) $ok->headers->get('X-Server-Time'))->toBeGreaterThanOrEqual($before)
        ->and($ok->json('serverTime'))->toBeInt();
    $this->getJson('/api/nope')->assertNotFound()->assertHeader('X-Server-Time');
    $this->getJson('/api/test/x/member')->assertUnauthorized()->assertHeader('X-Server-Time');
    $this->get('/display')->assertHeaderMissing('X-Server-Time');
});

it('BE-17 renders the contract error shape for each code', function () {
    $session = PresentationSession::factory()->create();
    $display = Device::factory()->for($session, 'session')->create();
    $other = Device::factory()->create();

    $shape = fn ($r, string $code, int $status, bool $retryable) => $r->assertStatus($status)
        ->assertJsonPath('error.code', $code)
        ->assertJsonPath('error.retryable', $retryable)
        ->assertJsonStructure(['error' => ['code', 'message', 'retryable']]);

    $shape($this->getJson("/api/test/{$session->id}/member"), 'UNAUTHENTICATED', 401, false);
    $shape($this->withToken(tokenFor($other, 'display'))->getJson("/api/test/{$session->id}/member"), 'NOT_SESSION_MEMBER', 403, false);
    $this->app['auth']->forgetGuards();
    $shape($this->withToken(tokenFor($display, 'display'))->getJson("/api/test/{$session->id}/controller-only"), 'FORBIDDEN_ROLE', 403, false);
    $this->app['auth']->forgetGuards();
    $shape($this->withToken(tokenFor($display, 'display'))->getJson('/api/test/01JD3Q8Z6R0V5M8K2Y7T1N4B9C/member'), 'SESSION_NOT_FOUND', 404, false);
    $shape($this->getJson('/api/test/boom/pairing-invalid'), 'PAIRING_INVALID', 404, false);
    $shape($this->getJson('/api/test/boom/pairing-expired'), 'PAIRING_EXPIRED', 410, false);
    $shape($this->getJson('/api/test/boom/relay'), 'RELAY_UNAVAILABLE', 503, true);
    $shape($this->postJson('/api/test/validate', []), 'VALIDATION_FAILED', 422, false)->assertJsonStructure(['error' => ['errors' => ['name']]]);

    $session->update(['status' => PresentationSession::STATUS_ENDED]);
    $this->app['auth']->forgetGuards();
    $shape($this->withToken(tokenFor($display, 'display'))->getJson("/api/test/{$session->id}/member"), 'SESSION_ENDED', 410, false);
});

it('hides internal errors outside debug mode', function () {
    config(['app.debug' => false]);
    $this->getJson('/api/test/boom/other')
        ->assertStatus(500)
        ->assertJsonPath('error.code', 'SERVER_ERROR')
        ->assertDontSee('secret detail');
});

it('lets members through and rejects revoked devices', function () {
    $session = PresentationSession::factory()->create();
    $display = Device::factory()->for($session, 'session')->create();
    Sanctum::actingAs($display, ['display']);
    $this->getJson("/api/test/{$session->id}/member")->assertOk()->assertJson(['id' => $session->id]);
    $this->getJson("/api/test/{$session->id}/display-only")->assertOk();

    $display->update(['revoked_at' => now()]);
    $this->getJson("/api/test/{$session->id}/member")->assertForbidden()->assertJsonPath('error.code', 'NOT_SESSION_MEMBER');
});

it('rejects expired tokens and slides controller token expiry', function () {
    $session = PresentationSession::factory()->create();
    $controller = Device::factory()->controller()->for($session, 'session')->create();

    $expired = $controller->createToken('controller', ['controller'], now()->subMinute())->plainTextToken;
    $this->withToken($expired)->getJson("/api/test/{$session->id}/member")->assertUnauthorized();
    $this->app['auth']->forgetGuards();

    $token = $controller->createToken('controller', ['controller'], now()->addHours(3));
    $this->withToken($token->plainTextToken)->getJson("/api/test/{$session->id}/controller-only")->assertOk();
    expect($token->accessToken->fresh()->expires_at->gt(now()->addDays(6)))->toBeTrue();
});
