<?php

use Illuminate\Support\Facades\Route;

// The service worker lives in public/build but must be served from the root scope (LLD §4.10).
Route::get('/sw.js', function () {
    $path = public_path('build/sw.js');
    abort_unless(is_file($path), 404);

    return response()->file($path, [
        'Content-Type' => 'text/javascript; charset=utf-8',
        'Cache-Control' => 'no-cache',
        'Service-Worker-Allowed' => '/',
    ]);
})->name('sw');

// Cache key for offline navigation (the service worker falls back to this shell).
Route::view('/__shell', 'app')->name('shell');

// SPA catch-all: every client-side route renders the same shell.
Route::view('/{any?}', 'app')
    ->where('any', '^(?!api|broadcasting|sw\.js|build|up$).*$')
    ->name('spa');
