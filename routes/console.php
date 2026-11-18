<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('sessions:prune')->dailyAt('03:00')->timezone('UTC')->withoutOverlapping();
Schedule::command('pairing:expire')->everyFiveMinutes()->withoutOverlapping();
