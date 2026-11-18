<?php

use App\Modules\Pairing\Controllers\PairingController;
use App\Modules\Relay\Controllers\CommandController;
use App\Modules\Relay\Controllers\SnapshotController;
use App\Modules\Sessions\Controllers\SessionController;
use Illuminate\Support\Facades\Route;

// LLD §7.3
Route::post('/sessions', [SessionController::class, 'store'])->middleware('throttle:session-create');
Route::post('/pairings', [PairingController::class, 'store'])->middleware('throttle:pairing');
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
});
