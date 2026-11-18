<?php

use App\Models\User;
use App\Modules\Sessions\Models\PresentationSession;

// A24 — email/password accounts gate the Display and the Controller.

it('signs up, logs in, reads the account and logs out', function () {
    $reg = $this->postJson('/api/auth/register', ['email' => ' Team@Church.ORG ', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass'])
        ->assertCreated()->assertJsonPath('user.email', 'team@church.org')->json();
    expect(User::query()->where('email', 'team@church.org')->exists())->toBeTrue();

    $login = $this->postJson('/api/auth/login', ['email' => 'TEAM@church.org', 'password' => 'secret-pass'])->assertOk()->json();
    expect($login['token'])->not->toBe($reg['token']);

    asDevice($login['token'])->getJson('/api/auth/me')->assertOk()->assertJsonPath('user.email', 'team@church.org');
    asDevice($login['token'])->postJson('/api/auth/logout')->assertNoContent();
    asDevice($login['token'])->getJson('/api/auth/me')->assertUnauthorized();
    asDevice($reg['token'])->getJson('/api/auth/me')->assertOk(); // other devices stay logged in
});

it('validates sign-up and rejects wrong passwords', function () {
    config(['stagecue.throttle.register' => 20]);
    $ok = ['password' => 'secret-pass', 'password_confirmation' => 'secret-pass'];
    $this->postJson('/api/auth/register', ['email' => 'not-an-email'] + $ok)->assertUnprocessable()->assertJsonPath('error.errors.email.0', 'Enter a valid email address.');
    $this->postJson('/api/auth/register', $ok)->assertUnprocessable();
    $this->postJson('/api/auth/register', ['email' => 'team@church.org', 'password' => 'short', 'password_confirmation' => 'short'])->assertUnprocessable();
    $this->postJson('/api/auth/register', ['email' => 'team@church.org', 'password' => 'secret-pass', 'password_confirmation' => 'other-pass'])->assertUnprocessable();
    $this->postJson('/api/auth/register', ['email' => 'team@church.org'] + $ok)->assertCreated();
    $this->postJson('/api/auth/register', ['email' => 'TEAM@church.org'] + $ok)
        ->assertUnprocessable()->assertJsonPath('error.errors.email.0', 'An account with that email already exists. Log in instead.');

    $this->postJson('/api/auth/login', ['email' => 'team@church.org', 'password' => 'wrong-pass'])->assertUnprocessable()->assertJsonPath('error.code', 'INVALID_CREDENTIALS');
    $this->postJson('/api/auth/login', ['email' => 'nobody@church.org', 'password' => 'secret-pass'])->assertUnprocessable()->assertJsonPath('error.code', 'INVALID_CREDENTIALS');
});

it('can switch sign-up off', function () {
    config(['stagecue.registration' => 'closed']);
    $this->postJson('/api/auth/register', ['email' => 'team@church.org', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass'])
        ->assertForbidden()->assertJsonPath('error.code', 'REGISTRATION_CLOSED');
});

it('needs an account to open a display or pair a phone', function () {
    $this->postJson('/api/sessions', [])->assertUnauthorized();
    $this->postJson('/api/pairings', ['code' => 'ABC234', 'deviceName' => 'p'])->assertUnauthorized();

    // A device token is not an account token.
    $d = createDisplay();
    asDevice($d['token'])->postJson('/api/sessions', [])->assertUnauthorized()->assertJsonPath('error.code', 'ACCOUNT_REQUIRED');
    expect(PresentationSession::find($d['session'])->user_id)->toBe(User::query()->where('email', 'team@example.test')->value('id'));
    expect($d['body']['session']['accountId'])->toBeInt();
});

it('only pairs a phone logged in to the same account as the display', function () {
    $d = createDisplay('Main Hall TV', 'church-a');
    asDevice(accountToken('church-b'))->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'Other phone'])
        ->assertForbidden()->assertJsonPath('error.code', 'ACCOUNT_MISMATCH');
    asDevice(accountToken('church-b'))->postJson('/api/pairings', ['token' => $d['pairingToken'], 'deviceName' => 'Other phone'])
        ->assertForbidden()->assertJsonPath('error.code', 'ACCOUNT_MISMATCH');

    // The code is not used up by the rejected attempt.
    pairController($d, 'Our phone');
});

it('never pairs into a display created before accounts existed', function () {
    $d = createDisplay();
    PresentationSession::query()->whereKey($d['session'])->update(['user_id' => null]);
    asDevice($d['account'])->postJson('/api/pairings', ['code' => $d['code'], 'deviceName' => 'p'])->assertForbidden();
});

it('limits login attempts', function () {
    config(['stagecue.throttle.login' => 3]);
    foreach (range(1, 3) as $_) {
        $this->postJson('/api/auth/login', ['email' => 'team@church.org', 'password' => 'nope-nope'])->assertUnprocessable();
    }
    $this->postJson('/api/auth/login', ['email' => 'team@church.org', 'password' => 'nope-nope'])->assertStatus(429);
});
