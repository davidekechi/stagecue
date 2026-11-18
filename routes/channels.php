<?php

use App\Modules\Sessions\Models\Device;
use Illuminate\Support\Facades\Broadcast;

// LLD §7.6 — devices authenticate with their Sanctum bearer token on POST /api/broadcasting/auth.
Broadcast::channel('session.{sid}.display', fn (Device $d, string $sid) => $d->session_id === $sid && $d->isDisplay() && ! $d->isRevoked(), ['guards' => ['sanctum']]);

Broadcast::channel('session.{sid}.controllers', fn (Device $d, string $sid) => $d->session_id === $sid && ! $d->isRevoked(), ['guards' => ['sanctum']]);

// Presence: carries the heartbeat whispers and join/leave.
Broadcast::channel('session.{sid}', fn (Device $d, string $sid) => $d->session_id === $sid && ! $d->isRevoked()
    ? ['id' => $d->id, 'role' => $d->role, 'name' => $d->name]
    : false, ['guards' => ['sanctum']]);
