<?php

use Illuminate\Support\Facades\Route;

Route::get('/time', fn () => ['serverTime' => now()->getTimestampMs()])->name('time');
