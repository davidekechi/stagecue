<?php

use App\Modules\Relay\Events\CommandRelayed;
use App\Modules\Relay\Events\ControllerPaired;
use App\Modules\Relay\Events\ControllerRevoked;
use App\Modules\Relay\Events\PeerHeartbeat;
use App\Modules\Relay\Events\SessionEnded;
use App\Modules\Relay\Events\StateUpdated;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

function contractFixture(string $name): array
{
    return json_decode(file_get_contents(resource_path("js/contracts/fixtures/{$name}.json")), true, flags: JSON_THROW_ON_ERROR);
}

function channelNames(object $event): array
{
    return array_map(fn ($c) => $c->name, $event->broadcastOn());
}

const SID = '01JD3Q8Z6R0V5M8K2Y7T1N4B9C';

it('all events broadcast immediately', function (string $class) {
    expect(is_subclass_of($class, ShouldBroadcastNow::class))->toBeTrue();
})->with([CommandRelayed::class, StateUpdated::class, ControllerPaired::class, ControllerRevoked::class, SessionEnded::class, PeerHeartbeat::class]);

it('CommandRelayed carries the envelope fixture to the display channel', function () {
    $env = contractFixture('command.MESSAGE_SHOW');
    $e = new CommandRelayed(SID, $env);
    expect($e->broadcastAs())->toBe('command')
        ->and(channelNames($e))->toBe(['private-session.'.SID.'.display'])
        ->and($e->broadcastWith())->toBe($env)
        ->and(array_keys($e->broadcastWith()))->toBe(array_keys(contractFixture('command.TIMER_START')));
});

it('StateUpdated carries the state event fixture to the controllers channel', function () {
    $state = contractFixture('event.state');
    $e = new StateUpdated(SID, $state);
    expect($e->broadcastAs())->toBe('state')
        ->and(channelNames($e))->toBe(['private-session.'.SID.'.controllers'])
        ->and($e->broadcastWith())->toBe($state);
});

it('ControllerPaired matches its fixture', function () {
    $f = contractFixture('event.controller-paired');
    $e = new ControllerPaired(SID, $f['deviceId'], $f['name'], $f['pairedAt']);
    expect($e->broadcastAs())->toBe('controller.paired')
        ->and(channelNames($e))->toBe(['private-session.'.SID.'.display'])
        ->and($e->broadcastWith())->toBe($f);
});

it('ControllerRevoked matches its fixture on both channels', function () {
    $f = contractFixture('event.controller-revoked');
    $e = new ControllerRevoked(SID, $f['deviceId'], $f['reason']);
    expect($e->broadcastAs())->toBe('controller.revoked')
        ->and(channelNames($e))->toBe(['private-session.'.SID.'.display', 'private-session.'.SID.'.controllers'])
        ->and($e->broadcastWith())->toBe($f);
});

it('SessionEnded matches its fixture on both channels', function () {
    $f = contractFixture('event.session-ended');
    $e = new SessionEnded(SID, $f['endedAt']);
    expect($e->broadcastAs())->toBe('session.ended')
        ->and(channelNames($e))->toHaveCount(2)
        ->and($e->broadcastWith())->toBe($f);
});

it('PeerHeartbeat matches its fixture and goes to the opposite role', function () {
    $f = contractFixture('event.peer-heartbeat');
    $e = new PeerHeartbeat(SID, 'display', $f['revision'], $f['presentationId'], $f['sentAt']);
    expect($e->broadcastAs())->toBe('peer.heartbeat')
        ->and(channelNames($e))->toBe(['private-session.'.SID.'.controllers'])
        ->and($e->broadcastWith())->toBe($f)
        ->and(channelNames(new PeerHeartbeat(SID, 'controller', null, null, 1)))->toBe(['private-session.'.SID.'.display']);
});
