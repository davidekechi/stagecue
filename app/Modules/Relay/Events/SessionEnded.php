<?php

declare(strict_types=1);

namespace App\Modules\Relay\Events;

use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class SessionEnded implements ShouldBroadcastNow
{
    use BroadcastsV1;

    public function __construct(public string $sessionId, public int $endedAt) {}

    public function broadcastOn(): array
    {
        return [self::displayChannel($this->sessionId), self::controllersChannel($this->sessionId)];
    }

    public function broadcastAs(): string
    {
        return 'session.ended';
    }

    public function broadcastWith(): array
    {
        return ['v' => 1, 'endedAt' => $this->endedAt];
    }
}
