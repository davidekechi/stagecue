<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Broadcasting\BroadcastException;
use Illuminate\Support\Facades\Log;
use Throwable;

/** Broadcasts that must not fail the request (pairing/session lifecycle notifications). */
final class SafeBroadcast
{
    /** @param array<string, mixed> $context */
    public static function send(object $event, array $context = []): bool
    {
        try {
            broadcast($event);

            return true;
        } catch (BroadcastException|Throwable $e) {
            Log::warning('broadcast failed', $context + ['event' => $event::class, 'error' => $e->getMessage()]);

            return false;
        }
    }
}
