<?php

declare(strict_types=1);

namespace App\Modules\Accounts\Services;

use App\Exceptions\ApiException;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

/** A24 — email/password accounts with long-lived, sliding Sanctum tokens (ability `account`). */
class AccountService
{
    /** @return array{user: User, token: string} */
    public function register(string $email, string $password, ?string $deviceName): array
    {
        if (config('stagecue.registration') !== 'open') {
            throw ApiException::registrationClosed();
        }
        $user = User::query()->create(['email' => strtolower(trim($email)), 'password' => $password]);

        return ['user' => $user, 'token' => $this->issueToken($user, $deviceName)];
    }

    /** @return array{user: User, token: string} */
    public function login(string $email, string $password, ?string $deviceName): array
    {
        $user = User::query()->where('email', strtolower(trim($email)))->first();
        if (! $user || ! Hash::check($password, $user->password)) {
            throw ApiException::invalidCredentials();
        }

        return ['user' => $user, 'token' => $this->issueToken($user, $deviceName)];
    }

    private function issueToken(User $user, ?string $deviceName): string
    {
        $name = 'account:'.mb_substr($deviceName ?: 'device', 0, 60);

        return $user->createToken($name, ['account'], now()->addDays((int) config('stagecue.account_token_days')))->plainTextToken;
    }

    /** @return array{id: int, email: string} */
    public static function payload(User $user): array
    {
        return ['id' => $user->id, 'email' => $user->email];
    }
}
