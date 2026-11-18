<?php

use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use App\Modules\Sessions\Models\SessionCommand;
use Illuminate\Database\QueryException;
use Illuminate\Support\Str;

it('creates sessions and devices with ULID keys', function () {
    $session = PresentationSession::factory()->create();
    $display = Device::factory()->for($session, 'session')->create();

    expect(Str::isUlid($session->id))->toBeTrue()
        ->and(Str::isUlid($display->id))->toBeTrue()
        ->and($display->session->is($session))->toBeTrue()
        ->and($display->isDisplay())->toBeTrue()
        ->and($session->isEnded())->toBeFalse();
});

it('resolves the display device and the active controller', function () {
    $session = PresentationSession::factory()->create();
    $display = Device::factory()->for($session, 'session')->create();
    Device::factory()->controller()->revoked()->for($session, 'session')->create();
    $active = Device::factory()->controller()->for($session, 'session')->create();

    expect($session->displayDevice->is($display))->toBeTrue()
        ->and($session->activeController->is($active))->toBeTrue()
        ->and($session->devices()->count())->toBe(3)
        ->and(Device::query()->active()->count())->toBe(2)
        ->and($active->isController())->toBeTrue();
});

it('issues Sanctum tokens to devices (ULID morph)', function () {
    $device = Device::factory()->create();
    $token = $device->createToken('display', ['display'], now()->addDays(30));

    expect($token->accessToken->tokenable->is($device))->toBeTrue()
        ->and($token->accessToken->can('display'))->toBeTrue();
});

it('logs commands and enforces idempotency per session', function () {
    $device = Device::factory()->controller()->create();
    $attrs = [
        'session_id' => $device->session_id,
        'device_id' => $device->id,
        'command_id' => (string) Str::uuid7(),
        'seq' => 1,
        'name' => 'TIMER_START',
        'payload' => [],
        'status' => SessionCommand::STATUS_RELAYED,
        'relayed_at' => now(),
    ];
    $cmd = SessionCommand::create($attrs);

    expect($cmd->session->is($device->session))->toBeTrue()
        ->and($cmd->device->is($device))->toBeTrue()
        ->and($cmd->isAcked())->toBeFalse()
        ->and($device->session->commands()->count())->toBe(1);

    expect(fn () => SessionCommand::create($attrs))->toThrow(QueryException::class);
});

it('cascades deletes from the session', function () {
    $device = Device::factory()->create();
    $device->createToken('display', ['display']);
    $device->session->delete();

    expect(Device::count())->toBe(0);
});

it('marks sessions ended via the factory state', function () {
    expect(PresentationSession::factory()->ended()->create()->isEnded())->toBeTrue();
});
