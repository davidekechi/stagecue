<?php

declare(strict_types=1);

namespace App\Modules\Relay\Events;

use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/** Server → Display: the command envelope (04 §3.1). */
class CommandRelayed implements ShouldBroadcastNow
{
    use BroadcastsV1;

    /** @param array<string, mixed> $envelope */
    public function __construct(public string $sessionId, public array $envelope) {}

    public function broadcastOn(): array
    {
        return [self::displayChannel($this->sessionId)];
    }

    public function broadcastAs(): string
    {
        return 'command';
    }

    public function broadcastWith(): array
    {
        return $this->envelope;
    }
}
