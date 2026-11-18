<?php

use App\Modules\Accounts\Controllers\AuthController;
use App\Modules\Pairing\Controllers\PairingController;
use App\Modules\Relay\Controllers\CommandController;
use App\Modules\Relay\Controllers\HeartbeatController;
use App\Modules\Relay\Controllers\SnapshotController;
use App\Modules\Sessions\Controllers\SessionController;
use Illuminate\Support\Facades\Route;

// A24 — accounts
Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:register');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::middleware(['auth:sanctum', 'account'])->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    // LLD §7.3 — creating a session and pairing now need a logged-in account (A24).
    Route::post('/sessions', [SessionController::class, 'store'])->middleware('throttle:session-create');
    Route::post('/pairings', [PairingController::class, 'store'])->middleware('throttle:pairing');
});
Route::get('/time', fn () => ['serverTime' => now()->getTimestampMs()])->name('time');

Route::middleware(['auth:sanctum', 'session.member'])->prefix('/sessions/{session}')->group(function () {
    Route::get('/', [SessionController::class, 'show']);
    Route::get('/state', [SnapshotController::class, 'show']);
    Route::delete('/', [SessionController::class, 'destroy'])->middleware('ability:display');
    Route::post('/pairing/regenerate', [PairingController::class, 'regenerate'])->middleware('ability:display');
    Route::delete('/controller', [PairingController::class, 'revoke'])->middleware('ability:display');
    Route::delete('/controller/self', [PairingController::class, 'leave'])->middleware('ability:controller');
    Route::post('/commands', [CommandController::class, 'store'])->middleware(['ability:controller', 'throttle:commands']);
    Route::post('/snapshots', [SnapshotController::class, 'store'])->middleware(['ability:display', 'throttle:snapshots']);
    Route::post('/heartbeat', HeartbeatController::class)->middleware('throttle:heartbeat'); // fallback only (D6)
});
