<?php

declare(strict_types=1);

namespace App\Modules\Relay\Events;

use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class ControllerPaired implements ShouldBroadcastNow
{
    use BroadcastsV1;

    public function __construct(public string $sessionId, public string $deviceId, public string $name, public int $pairedAt) {}

    public function broadcastOn(): array
    {
        return [self::displayChannel($this->sessionId)];
    }

    public function broadcastAs(): string
    {
        return 'controller.paired';
    }

    public function broadcastWith(): array
    {
        return ['v' => 1, 'deviceId' => $this->deviceId, 'name' => $this->name, 'pairedAt' => $this->pairedAt];
    }
}
