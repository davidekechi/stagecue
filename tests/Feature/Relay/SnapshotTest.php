<?php

use App\Modules\Relay\Events\CommandRelayed;
use App\Modules\Relay\Events\StateUpdated;
use App\Modules\Sessions\Models\PresentationSession;
use App\Modules\Sessions\Models\SessionCommand;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;

function snapshotBody(int $revision, array $acks = [], string $presentationId = '01JD3S0000000000000000PRES'): array
{
    $body = json_decode(file_get_contents(resource_path('js/contracts/fixtures/snapshot.json')), true);
    $body['revision'] = $revision;
    $body['state']['revision'] = $revision;
    $body['presentationId'] = $presentationId;
    $body['state']['presentationId'] = $presentationId;
    $body['acks'] = $acks;

    return $body;
}

it('stores a snapshot, broadcasts it, and serves it from GET /state', function () {
    Event::fake([StateUpdated::class]);
    $d = createDisplay();
    $c = pairController($d);
    $url = "/api/sessions/{$d['session']}";

    asDevice($c['token'])->getJson("{$url}/state")->assertOk()->assertJson(['snapshot' => null, 'storedAt' => null]);
    asDevice($d['token'])->postJson("{$url}/snapshots", snapshotBody(42))->assertStatus(202)->assertJson(['accepted' => true, 'stored' => true]);

    Event::assertDispatched(StateUpdated::class, function (StateUpdated $e) use ($d) {
        $p = $e->broadcastWith();
        $f = json_decode(file_get_contents(resource_path('js/contracts/fixtures/event.state.json')), true);

        return $p['type'] === 'state' && $p['sessionId'] === $d['session'] && array_keys($p) === array_keys($f) && $p['revision'] === 42;
    });

    $state = asDevice($c['token'])->getJson("{$url}/state")->assertOk();
    expect($state->json('snapshot.revision'))->toBe(42)
        ->and($state->json('snapshot'))->not->toHaveKey('acks')
        ->and($state->json('snapshot.state.message.text'))->toBe('Please take your seats')
        ->and($state->json('storedAt'))->toBeInt();
});

it('BE-12 an older revision is not stored, but its acks still update the command log', function () {
    Event::fake([StateUpdated::class, CommandRelayed::class]);
    $d = createDisplay();
    $c = pairController($d);
    $url = "/api/sessions/{$d['session']}";
    $id = (string) Str::uuid7();
    asDevice($c['token'])->postJson("{$url}/commands", ['v' => 1, 'commandId' => $id, 'name' => 'TIMER_START', 'baseRevision' => 1, 'issuedAt' => 1, 'payload' => new stdClass])->assertStatus(202);

    asDevice($d['token'])->postJson("{$url}/snapshots", snapshotBody(10))->assertJson(['stored' => true]);
    asDevice($d['token'])->postJson("{$url}/snapshots", snapshotBody(9, [['commandId' => $id, 'seq' => 1, 'result' => 'REJECTED', 'code' => 'INVALID_STATE', 'message' => 'no']]))
        ->assertStatus(202)
        ->assertJson(['accepted' => true, 'stored' => false]);

    $row = SessionCommand::first();
    expect($row->status)->toBe('rejected')->and($row->result_code)->toBe('INVALID_STATE')->and($row->acked_at)->not->toBeNull();
    asDevice($c['token'])->getJson("{$url}/state")->assertJsonPath('snapshot.revision', 10);
    Event::assertDispatchedTimes(StateUpdated::class, 2); // the old one still carried an ack

    // Older and without acks: not stored, not broadcast.
    asDevice($d['token'])->postJson("{$url}/snapshots", snapshotBody(8))->assertJson(['stored' => false]);
    Event::assertDispatchedTimes(StateUpdated::class, 2);
});

it('accepts a lower revision from a new presentation epoch', function () {
    Event::fake([StateUpdated::class]);
    $d = createDisplay();
    $url = "/api/sessions/{$d['session']}/snapshots";
    asDevice($d['token'])->postJson($url, snapshotBody(50))->assertJson(['stored' => true]);
    asDevice($d['token'])->postJson($url, snapshotBody(0, [], '01JD3T0000000000000000PRES'))->assertJson(['stored' => true]);
    expect(PresentationSession::find($d['session'])->last_presentation_id)->toBe('01JD3T0000000000000000PRES');
});

it('marks APPLIED and DUPLICATE acks', function () {
    Event::fake([StateUpdated::class, CommandRelayed::class]);
    $d = createDisplay();
    $c = pairController($d);
    $url = "/api/sessions/{$d['session']}";
    $a = (string) Str::uuid7();
    $b = (string) Str::uuid7();
    foreach ([$a, $b] as $id) {
        asDevice($c['token'])->postJson("{$url}/commands", ['v' => 1, 'commandId' => $id, 'name' => 'BLACKOUT_ON', 'baseRevision' => null, 'issuedAt' => 1, 'payload' => new stdClass]);
    }
    asDevice($d['token'])->postJson("{$url}/snapshots", snapshotBody(1, [['commandId' => $a, 'result' => 'APPLIED'], ['commandId' => $b, 'result' => 'DUPLICATE']]))->assertStatus(202);
    expect(SessionCommand::where('command_id', $a)->value('status'))->toBe('applied')
        ->and(SessionCommand::where('command_id', $b)->value('status'))->toBe('duplicate');
});

it('enforces the 16 KB state limit, the shape and the display role', function () {
    Event::fake([StateUpdated::class]);
    $d = createDisplay();
    $c = pairController($d);
    $url = "/api/sessions/{$d['session']}/snapshots";

    $big = snapshotBody(1);
    $big['state']['message']['text'] = str_repeat('x', 17000);
    asDevice($d['token'])->postJson($url, $big)->assertUnprocessable()->assertJsonStructure(['error' => ['errors' => ['state']]]);
    $bad = snapshotBody(1);
    $bad['presentationId'] = 'not-a-ulid';
    asDevice($d['token'])->postJson($url, $bad)->assertUnprocessable();
    $many = snapshotBody(1, array_fill(0, 51, ['commandId' => (string) Str::uuid7(), 'result' => 'APPLIED']));
    asDevice($d['token'])->postJson($url, $many)->assertUnprocessable();
    asDevice($c['token'])->postJson($url, snapshotBody(1))->assertForbidden();
});
