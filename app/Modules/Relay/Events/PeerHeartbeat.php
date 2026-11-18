<?php

declare(strict_types=1);

namespace App\Modules\Relay\Events;

use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/** HTTP heartbeat fallback (LLD §6.4): relayed to the OTHER party's channel. */
class PeerHeartbeat implements ShouldBroadcastNow
{
    use BroadcastsV1;

    public function __construct(public string $sessionId, public string $fromRole, public ?int $revision, public ?string $presentationId, public int $sentAt) {}

    public function broadcastOn(): array
    {
        return [$this->fromRole === 'display' ? self::controllersChannel($this->sessionId) : self::displayChannel($this->sessionId)];
    }

    public function broadcastAs(): string
    {
        return 'peer.heartbeat';
    }

    public function broadcastWith(): array
    {
        return ['v' => 1, 'role' => $this->fromRole, 'revision' => $this->revision, 'presentationId' => $this->presentationId, 'sentAt' => $this->sentAt];
    }
}
