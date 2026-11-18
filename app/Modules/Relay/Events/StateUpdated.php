<?php

declare(strict_types=1);

namespace App\Modules\Relay\Events;

use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/** Server → Controllers: snapshot + acks (04 §3.2). */
class StateUpdated implements ShouldBroadcastNow
{
    use BroadcastsV1;

    /** @param array<string, mixed> $payload */
    public function __construct(public string $sessionId, public array $payload) {}

    public function broadcastOn(): array
    {
        return [self::controllersChannel($this->sessionId)];
    }

    public function broadcastAs(): string
    {
        return 'state';
    }

    public function broadcastWith(): array
    {
        return $this->payload;
    }
}
