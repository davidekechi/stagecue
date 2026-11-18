<?php

declare(strict_types=1);

namespace App\Modules\Relay\Events;

use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class ControllerRevoked implements ShouldBroadcastNow
{
    use BroadcastsV1;

    public const REASONS = ['replaced', 'revoked_by_display', 'left', 'session_ended'];

    public function __construct(public string $sessionId, public string $deviceId, public string $reason) {}

    public function broadcastOn(): array
    {
        return [self::displayChannel($this->sessionId), self::controllersChannel($this->sessionId)];
    }

    public function broadcastAs(): string
    {
        return 'controller.revoked';
    }

    public function broadcastWith(): array
    {
        return ['v' => 1, 'deviceId' => $this->deviceId, 'reason' => $this->reason];
    }
}
