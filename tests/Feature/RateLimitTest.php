<?php

use App\Modules\Relay\Events\StateUpdated;
use Illuminate\Support\Facades\Event;

it('limits session creation to 10 per minute per IP', function () {
    for ($i = 0; $i < 10; $i++) {
        asDevice(accountToken())->postJson('/api/sessions', [])->assertCreated();
    }
    asDevice(accountToken())->postJson('/api/sessions', [])->assertStatus(429)->assertJsonPath('error.code', 'RATE_LIMITED')->assertHeader('Retry-After');
});

it('limits pairing to 20 per hour per IP', function () {
    for ($i = 0; $i < 20; $i++) {
        asDevice(accountToken())->postJson('/api/pairings', ['code' => 'ZZZZZZ', 'deviceName' => 'p'])->assertNotFound();
        if ($i % 5 === 4) {
            $this->travel(61)->seconds(); // stay under the per-minute limit
        }
    }
    asDevice(accountToken())->postJson('/api/pairings', ['code' => 'ZZZZZZ', 'deviceName' => 'p'])->assertStatus(429);
});

it('limits snapshots to 120 per minute per device', function () {
    Event::fake([StateUpdated::class]);
    $d = createDisplay();
    $body = json_decode(file_get_contents(resource_path('js/contracts/fixtures/snapshot.json')), true);
    $body['acks'] = [];
    for ($i = 0; $i < 120; $i++) {
        asDevice($d['token'])->postJson("/api/sessions/{$d['session']}/snapshots", $body)->assertStatus(202);
    }
    asDevice($d['token'])->postJson("/api/sessions/{$d['session']}/snapshots", $body)->assertStatus(429);
    // Another device has its own budget.
    $other = createDisplay('Other');
    asDevice($other['token'])->postJson("/api/sessions/{$other['session']}/snapshots", $body)->assertStatus(202);
});
