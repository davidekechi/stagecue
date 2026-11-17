<?php

use Illuminate\Support\Facades\Route;

// Cache key for offline navigation (the service worker falls back to this shell).
Route::view('/__shell', 'app')->name('shell');

// SPA catch-all: every client-side route renders the same shell.
Route::view('/{any?}', 'app')
    ->where('any', '^(?!api|broadcasting|sw\.js|build|up$).*$')
    ->name('spa');
