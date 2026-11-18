<?php

use App\Modules\Sessions\Models\Device;
use Illuminate\Broadcasting\BroadcastManager;

beforeEach(function () {
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'test-key',
        'broadcasting.connections.reverb.secret' => 'test-secret',
        'broadcasting.connections.reverb.app_id' => '1',
    ]);
    // Channels were registered on the default (null) broadcaster at boot: register them on reverb.
    app(BroadcastManager::class)->purge('reverb');
    require base_path('routes/channels.php');
});

function authChannel(?string $token, string $channel)
{
    app('auth')->forgetGuards();
    $req = $token ? test()->withToken($token) : test()->withoutToken();

    return $req->postJson('/api/broadcasting/auth', ['socket_id' => '1234.5678', 'channel_name' => $channel]);
}

it('BE-13 authorises channels by role, session and revocation', function () {
    $d = createDisplay();
    $c = pairController($d);
    $other = createDisplay('Other');
    $sid = $d['session'];

    // Display: its own display, controllers and presence channels.
    authChannel($d['token'], "private-session.{$sid}.display")->assertOk()->assertJsonStructure(['auth']);
    authChannel($d['token'], "private-session.{$sid}.controllers")->assertOk();
    $presence = authChannel($d['token'], "presence-session.{$sid}")->assertOk();
    expect(json_decode($presence->json('channel_data'), true)['user_info'])->toMatchArray(['id' => $d['device'], 'role' => 'display']);

    // Controller: not the display channel.
    authChannel($c['token'], "private-session.{$sid}.display")->assertForbidden();
    authChannel($c['token'], "private-session.{$sid}.controllers")->assertOk();
    authChannel($c['token'], "presence-session.{$sid}")->assertOk();

    // Wrong session.
    authChannel($other['token'], "private-session.{$sid}.display")->assertForbidden();
    authChannel($other['token'], "presence-session.{$sid}")->assertForbidden();

    // No token.
    authChannel(null, "private-session.{$sid}.controllers")->assertUnauthorized();
});

it('WS-06 a revoked device cannot subscribe', function () {
    $d = createDisplay();
    $c = pairController($d);
    // Revoked but the token still exists (defence in depth: the channel callback checks revoked_at).
    Device::query()->whereKey($c['device'])->update(['revoked_at' => now()]);
    authChannel($c['token'], "private-session.{$d['session']}.controllers")->assertForbidden();
});
