<?php

declare(strict_types=1);

namespace App\Modules\Accounts\Controllers;

use App\Models\User;
use App\Modules\Accounts\Requests\LoginRequest;
use App\Modules\Accounts\Requests\RegisterRequest;
use App\Modules\Accounts\Services\AccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class AuthController
{
    public function __construct(private readonly AccountService $accounts) {}

    /** POST /auth/register */
    public function register(RegisterRequest $request): JsonResponse
    {
        $r = $this->accounts->register($request->string('email')->toString(), $request->string('password')->toString(), $request->userAgent());

        return new JsonResponse(['user' => AccountService::payload($r['user']), 'token' => $r['token']], 201);
    }

    /** POST /auth/login */
    public function login(LoginRequest $request): JsonResponse
    {
        $r = $this->accounts->login($request->string('email')->toString(), $request->string('password')->toString(), $request->userAgent());

        return new JsonResponse(['user' => AccountService::payload($r['user']), 'token' => $r['token']]);
    }

    /** GET /auth/me */
    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return new JsonResponse(['user' => AccountService::payload($user), 'registration' => config('stagecue.registration')]);
    }

    /** POST /auth/logout — revokes this device's account token. */
    public function logout(Request $request): Response
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->noContent();
    }
}
