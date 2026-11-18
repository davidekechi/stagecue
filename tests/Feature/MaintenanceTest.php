<?php

use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use App\Modules\Sessions\Models\SessionCommand;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

function logCommand(Device $device, $relayedAt): void
{
    SessionCommand::create([
        'session_id' => $device->session_id, 'device_id' => $device->id, 'command_id' => (string) Str::uuid7(),
        'seq' => 1, 'name' => 'TIMER_START', 'payload' => [], 'status' => 'applied', 'relayed_at' => $relayedAt,
    ]);
}

it('BE-15 prune honours the retention rules', function () {
    $fresh = Device::factory()->controller()->create();
    logCommand($fresh, now()->subDays(8));
    logCommand($fresh, now()->subDays(6));

    $idle = PresentationSession::factory()->create(['last_activity_at' => now()->subDays(8)]);
    $oldEnded = Device::factory()->for(PresentationSession::factory()->ended()->state(['ended_at' => now()->subDays(31)]), 'session')->create();
    $oldEnded->createToken('display', ['display']);
    $recentEnded = PresentationSession::factory()->ended()->create(['ended_at' => now()->subDays(5)]);
    $abandoned = PresentationSession::factory()->create(['last_activity_at' => now()->subDays(31)]);
    $fresh->createToken('controller', ['controller'], now()->subMinute()); // expired

    $this->artisan('sessions:prune')->assertSuccessful();

    expect(SessionCommand::count())->toBe(1)
        ->and($idle->fresh()->status)->toBe('ended')
        ->and(PresentationSession::find($oldEnded->session_id))->toBeNull()
        ->and(Device::find($oldEnded->id))->toBeNull()
        ->and(PresentationSession::find($recentEnded->id))->not->toBeNull()
        ->and(PresentationSession::find($abandoned->id))->toBeNull()
        ->and(PresentationSession::find($fresh->session_id))->not->toBeNull()
        ->and(PersonalAccessToken::count())->toBe(0);
});

it('expires pairing secrets', function () {
    $d = createDisplay();
    $this->artisan('pairing:expire')->assertSuccessful();
    expect(PresentationSession::find($d['session'])->pairing_code)->toBe($d['code']);
    $this->travel(11)->minutes();
    $this->artisan('pairing:expire')->assertSuccessful();
    expect(PresentationSession::find($d['session'])->pairing_code)->toBeNull();
});

it('schedules both maintenance commands', function () {
    $events = collect(app(Schedule::class)->events())->map(fn ($e) => [$e->command, $e->expression]);
    expect($events->first(fn ($e) => str_contains($e[0], 'sessions:prune'))[1])->toBe('0 3 * * *')
        ->and($events->first(fn ($e) => str_contains($e[0], 'pairing:expire'))[1])->toBe('*/5 * * * *');
});
