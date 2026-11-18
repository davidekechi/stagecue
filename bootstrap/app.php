<?php

use App\Exceptions\ApiErrorRenderer;
use App\Http\Middleware\AddServerTime;
use App\Http\Middleware\EnsureAccount;
use App\Http\Middleware\EnsureDeviceAbility;
use App\Http\Middleware\EnsureSessionMember;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    // POST /api/broadcasting/auth with a bearer token (04 §1.12).
    ->withBroadcasting(__DIR__.'/../routes/channels.php', ['prefix' => 'api', 'middleware' => ['api', 'auth:sanctum']])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(AddServerTime::class);
        $middleware->append(SecurityHeaders::class);
        $middleware->trustProxies(at: '*');
        // Message text keeps its whitespace and line breaks (FR-M1).
        $middleware->trimStrings(except: ['payload.text']);
        $middleware->alias([
            'session.member' => EnsureSessionMember::class,
            'ability' => EnsureDeviceAbility::class,
            'account' => EnsureAccount::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(new ApiErrorRenderer);
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
