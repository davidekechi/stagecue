<?php

declare(strict_types=1);

namespace App\Modules\Relay\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/** Shared plumbing: every event is v:1, sent immediately (ShouldBroadcastNow) under a short name. */
trait BroadcastsV1
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public static function displayChannel(string $sessionId): PrivateChannel
    {
        return new PrivateChannel("session.{$sessionId}.display");
    }

    public static function controllersChannel(string $sessionId): PrivateChannel
    {
        return new PrivateChannel("session.{$sessionId}.controllers");
    }
}
