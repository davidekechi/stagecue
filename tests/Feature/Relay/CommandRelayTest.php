<?php

use App\Modules\Relay\Events\CommandRelayed;
use App\Modules\Sessions\Models\PresentationSession;
use App\Modules\Sessions\Models\SessionCommand;
use Illuminate\Broadcasting\BroadcastManager;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;

function cmd(string $name, array $payload = [], ?int $baseRevision = 3, ?string $id = null): array
{
    return ['v' => 1, 'commandId' => $id ?? (string) Str::uuid7(), 'name' => $name, 'baseRevision' => $baseRevision, 'issuedAt' => 1794660100000, 'payload' => (object) $payload];
}

function relaySetup(): array
{
    $d = createDisplay();
    $c = pairController($d);

    return [$d, $c, "/api/sessions/{$d['session']}/commands"];
}

it('BE-09 relays a command: 202, CommandRelayed on the display channel, seq increments', function () {
    Event::fake([CommandRelayed::class]);
    [$d, $c, $url] = relaySetup();
    $first = cmd('TIMER_SET', ['durationMs' => 900000]);

    $r = asDevice($c['token'])->postJson($url, $first)->assertStatus(202);
    expect($r->json())->toMatchArray(['commandId' => $first['commandId'], 'seq' => 1, 'status' => 'relayed'])
        ->and($r->json('relayedAt'))->toBeInt();
    asDevice($c['token'])->postJson($url, cmd('TIMER_START'))->assertStatus(202)->assertJsonPath('seq', 2);

    Event::assertDispatched(CommandRelayed::class, function (CommandRelayed $e) use ($d, $c, $first) {
        $env = $e->broadcastWith();

        return $e->sessionId === $d['session']
            && $env['commandId'] === $first['commandId']
            && $env['type'] === 'command' && $env['v'] === 1 && $env['seq'] === 1
            && $env['payload'] === ['durationMs' => 900000]
            && $env['issuer'] === ['deviceId' => $c['device'], 'role' => 'controller']
            && $env['baseRevision'] === 3 && $env['issuedAt'] === 1794660100000;
    });
    Event::assertDispatched(CommandRelayed::class, fn ($e) => $e->broadcastWith()['payload'] instanceof stdClass); // `{}` on the wire
    expect(SessionCommand::query()->pluck('status')->all())->toBe(['relayed', 'relayed']);
});

it('BE-07 validates every catalogue entry', function (array $command, int $status) {
    Event::fake([CommandRelayed::class]);
    [, $c, $url] = relaySetup();
    asDevice($c['token'])->postJson($url, $command)->assertStatus($status);
})->with([
    'TIMER_SET ok' => [cmd('TIMER_SET', ['durationMs' => 1000]), 202],
    'TIMER_SET too short' => [cmd('TIMER_SET', ['durationMs' => 999]), 422],
    'TIMER_SET too long' => [cmd('TIMER_SET', ['durationMs' => 86_400_000]), 422],
    'TIMER_SET missing' => [cmd('TIMER_SET'), 422],
    'TIMER_START ok' => [cmd('TIMER_START'), 202],
    'TIMER_START with payload' => [cmd('TIMER_START', ['x' => 1]), 422],
    'TIMER_PAUSE' => [cmd('TIMER_PAUSE'), 202],
    'TIMER_RESUME' => [cmd('TIMER_RESUME'), 202],
    'TIMER_RESET' => [cmd('TIMER_RESET'), 202],
    'TIMER_CLEAR' => [cmd('TIMER_CLEAR'), 202],
    'MESSAGE_SHOW timed' => [cmd('MESSAGE_SHOW', ['id' => (string) Str::uuid7(), 'text' => "Two\nlines", 'mode' => 'timed', 'durationMs' => 10000, 'corner' => 'tr']), 202],
    'MESSAGE_SHOW persistent, no corner' => [cmd('MESSAGE_SHOW', ['id' => (string) Str::uuid7(), 'text' => 'Hi', 'mode' => 'persistent']), 202],
    'MESSAGE_SHOW timed without duration' => [cmd('MESSAGE_SHOW', ['id' => (string) Str::uuid7(), 'text' => 'Hi', 'mode' => 'timed']), 422],
    'MESSAGE_SHOW blank' => [cmd('MESSAGE_SHOW', ['id' => (string) Str::uuid7(), 'text' => "  \n ", 'mode' => 'persistent']), 422],
    'MESSAGE_SHOW too long' => [cmd('MESSAGE_SHOW', ['id' => (string) Str::uuid7(), 'text' => str_repeat('x', 501), 'mode' => 'persistent']), 422],
    'MESSAGE_SHOW bad corner' => [cmd('MESSAGE_SHOW', ['id' => (string) Str::uuid7(), 'text' => 'Hi', 'mode' => 'persistent', 'corner' => 'middle']), 422],
    'MESSAGE_SHOW unknown key' => [cmd('MESSAGE_SHOW', ['id' => (string) Str::uuid7(), 'text' => 'Hi', 'mode' => 'persistent', 'colour' => 'red']), 422],
    'MESSAGE_DISMISS with id' => [cmd('MESSAGE_DISMISS', ['id' => (string) Str::uuid7()]), 202],
    'MESSAGE_DISMISS empty' => [cmd('MESSAGE_DISMISS'), 202],
    'MESSAGE_DISMISS bad id' => [cmd('MESSAGE_DISMISS', ['id' => 'nope']), 422],
    'BLACKOUT_ON' => [cmd('BLACKOUT_ON'), 202],
    'BLACKOUT_OFF' => [cmd('BLACKOUT_OFF'), 202],
    'SETTINGS_UPDATE ok' => [cmd('SETTINGS_UPDATE', ['defaultCorner' => 'bl', 'overtimeInterruptsMessage' => true]), 202],
    'SETTINGS_UPDATE bad' => [cmd('SETTINGS_UPDATE', ['theme' => 'dark']), 422],
    'PRESENTATION_NEW' => [cmd('PRESENTATION_NEW'), 202],
    'SYNC_REQUEST null base' => [cmd('SYNC_REQUEST', [], null), 202],
    'unknown name' => [cmd('TIMER_EXPLODE'), 422],
    'bad version' => [['v' => 2] + cmd('TIMER_START'), 422],
    'bad commandId' => [array_merge(cmd('TIMER_START'), ['commandId' => 'abc']), 422],
]);

it('keeps message text whitespace and line breaks', function () {
    Event::fake([CommandRelayed::class]);
    [, $c, $url] = relaySetup();
    asDevice($c['token'])->postJson($url, cmd('MESSAGE_SHOW', ['id' => (string) Str::uuid7(), 'text' => "  Line one\nLine two  ", 'mode' => 'persistent']))->assertStatus(202);
    expect(SessionCommand::first()->payload['text'])->toBe("  Line one\nLine two  ");
});

it('BE-08 the display token and other sessions are refused', function () {
    Event::fake([CommandRelayed::class]);
    [$d, $c, $url] = relaySetup();
    $other = pairController(createDisplay('Other'));

    asDevice($d['token'])->postJson($url, cmd('TIMER_START'))->assertForbidden()->assertJsonPath('error.code', 'FORBIDDEN_ROLE');
    asDevice($other['token'])->postJson($url, cmd('TIMER_START'))->assertForbidden()->assertJsonPath('error.code', 'NOT_SESSION_MEMBER');
    Event::assertNotDispatched(CommandRelayed::class);
});

it('BE-10 a duplicate commandId → 200 duplicate; re-broadcast only while not yet acked', function () {
    Event::fake([CommandRelayed::class]);
    [, $c, $url] = relaySetup();
    $command = cmd('TIMER_START');

    asDevice($c['token'])->postJson($url, $command)->assertStatus(202);
    asDevice($c['token'])->postJson($url, $command)
        ->assertOk()
        ->assertJson(['duplicate' => true, 'seq' => 1, 'status' => 'relayed', 'resultCode' => null]);
    Event::assertDispatchedTimes(CommandRelayed::class, 2);

    SessionCommand::query()->update(['status' => 'rejected', 'result_code' => 'INVALID_STATE']);
    asDevice($c['token'])->postJson($url, $command)
        ->assertOk()
        ->assertJson(['duplicate' => true, 'status' => 'rejected', 'resultCode' => 'INVALID_STATE']);
    Event::assertDispatchedTimes(CommandRelayed::class, 2);
    expect(SessionCommand::count())->toBe(1);
});

it('BE-11 concurrent commands get unique, gapless seq numbers', function () {
    Event::fake([CommandRelayed::class]);
    [$d, $c, $url] = relaySetup();
    $commandIds = [];
    for ($i = 0; $i < 25; $i++) {
        $commandIds[] = $id = (string) Str::uuid7();
        asDevice($c['token'])->postJson($url, cmd('SYNC_REQUEST', [], null, $id))->assertStatus(202);
    }
    expect(SessionCommand::query()->orderBy('seq')->pluck('seq')->all())->toBe(range(1, 25));
    // The sequence lives on the session row and is only ever advanced by an atomic UPDATE … RETURNING.
    expect(PresentationSession::find($d['session'])->command_seq)->toBe(25);
});

it('BE-18 Reverb down → 503 RELAY_UNAVAILABLE; a retry re-broadcasts the pending row', function () {
    [$d, $c, $url] = relaySetup();
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'k',
        'broadcasting.connections.reverb.secret' => 's',
        'broadcasting.connections.reverb.app_id' => '1',
        'broadcasting.connections.reverb.options.host' => '127.0.0.1',
        'broadcasting.connections.reverb.options.port' => 1,
        'broadcasting.connections.reverb.options.scheme' => 'http',
    ]);
    app(BroadcastManager::class)->purge('reverb');
    $command = cmd('TIMER_START');

    asDevice($c['token'])->postJson($url, $command)
        ->assertStatus(503)
        ->assertJsonPath('error.code', 'RELAY_UNAVAILABLE')
        ->assertJsonPath('error.retryable', true);
    expect(SessionCommand::first()->status)->toBe('pending');

    config(['broadcasting.default' => 'null']);
    Event::fake([CommandRelayed::class]);
    asDevice($c['token'])->postJson($url, $command)->assertOk()->assertJson(['duplicate' => true, 'status' => 'relayed']);
    Event::assertDispatchedTimes(CommandRelayed::class, 1);
});

it('rate-limits commands per device (60/min)', function () {
    Event::fake([CommandRelayed::class]);
    [, $c, $url] = relaySetup();
    for ($i = 0; $i < 60; $i++) {
        asDevice($c['token'])->postJson($url, cmd('SYNC_REQUEST', [], null))->assertStatus(202);
    }
    asDevice($c['token'])->postJson($url, cmd('SYNC_REQUEST', [], null))->assertStatus(429)->assertJsonPath('error.code', 'RATE_LIMITED');
});
