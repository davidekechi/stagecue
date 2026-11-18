<?php

use App\Modules\Relay\Events\PeerHeartbeat;
use Illuminate\Support\Facades\Event;

it('relays an HTTP heartbeat to the opposite role', function () {
    Event::fake([PeerHeartbeat::class]);
    $d = createDisplay();
    $c = pairController($d);
    $url = "/api/sessions/{$d['session']}/heartbeat";

    asDevice($d['token'])->postJson($url, ['revision' => 42, 'presentationId' => '01JD3S0000000000000000PRES'])->assertNoContent();
    Event::assertDispatched(PeerHeartbeat::class, fn (PeerHeartbeat $e) => $e->fromRole === 'display'
        && $e->broadcastOn()[0]->name === "private-session.{$d['session']}.controllers"
        && $e->broadcastWith()['revision'] === 42);

    asDevice($c['token'])->postJson($url, [])->assertNoContent();
    Event::assertDispatched(PeerHeartbeat::class, fn (PeerHeartbeat $e) => $e->fromRole === 'controller'
        && $e->broadcastOn()[0]->name === "private-session.{$d['session']}.display");
});

it('rejects non-members and limits heartbeats to 30 per minute', function () {
    Event::fake([PeerHeartbeat::class]);
    $d = createDisplay();
    $other = createDisplay('Other');
    asDevice($other['token'])->postJson("/api/sessions/{$d['session']}/heartbeat", [])->assertForbidden();
    for ($i = 0; $i < 30; $i++) {
        asDevice($d['token'])->postJson("/api/sessions/{$d['session']}/heartbeat", [])->assertNoContent();
    }
    asDevice($d['token'])->postJson("/api/sessions/{$d['session']}/heartbeat", [])->assertStatus(429);
});
