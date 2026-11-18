<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}

/*
|--------------------------------------------------------------------------
| StageCue helpers
|--------------------------------------------------------------------------
*/

/**
 * A24 — a logged-in account token. The same name always yields the same account (name@example.test) within a test.
 */
function accountToken(string $name = 'team'): string
{
    $user = User::query()->where('email', "{$name}@example.test")->first()
        ?? User::query()->create(['email' => "{$name}@example.test", 'password' => 'password123']);

    return $user->createToken('account:test', ['account'], now()->addDays(90))->plainTextToken;
}

/**
 * Creates a Display session through the API.
 *
 * @return array{session: string, device: string, token: string, code: string, pairingToken: string, body: array<string, mixed>}
 */
function createDisplay(string $name = 'Main Hall TV', string $account = 'team'): array
{
    $accountToken = accountToken($account);
    $body = asDevice($accountToken)->postJson('/api/sessions', ['displayName' => $name])->assertCreated()->json();
    app('auth')->forgetGuards();

    return [
        'session' => $body['session']['id'],
        'device' => $body['device']['id'],
        'token' => $body['token'],
        'code' => $body['pairing']['code'],
        'pairingToken' => $body['pairing']['token'],
        'account' => $accountToken,
        'body' => $body,
    ];
}

/**
 * Pairs a Controller to a display created with createDisplay().
 *
 * @param  array{code: string, account: string}  $display
 * @return array{session: string, device: string, token: string, body: array<string, mixed>}
 */
function pairController(array $display, string $deviceName = 'Phone'): array
{
    $body = asDevice($display['account'])->postJson('/api/pairings', ['code' => $display['code'], 'deviceName' => $deviceName])->assertCreated()->json();
    app('auth')->forgetGuards();

    return ['session' => $body['session']['id'], 'device' => $body['device']['id'], 'token' => $body['token'], 'body' => $body];
}

/** Sends a request with a bearer token, resetting the guard so tokens never leak between calls. */
function asDevice(string $token)
{
    app('auth')->forgetGuards();

    return test()->withToken($token);
}
