<?php

declare(strict_types=1);

namespace App\Modules\Relay\Controllers;

use App\Modules\Relay\Events\PeerHeartbeat;
use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use App\Modules\Sessions\Services\SessionService;
use App\Support\SafeBroadcast;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** POST /sessions/{sid}/heartbeat — fallback when whispers are unavailable (04 §1.10, LLD §6.4). */
class HeartbeatController
{
    public function __construct(private readonly SessionService $sessions) {}

    public function __invoke(Request $request, PresentationSession $session): Response
    {
        $data = $request->validate([
            'revision' => ['nullable', 'integer', 'min:0'],
            'presentationId' => ['nullable', 'string', 'max:64'],
        ]);
        /** @var Device $device */
        $device = $request->user();
        $this->sessions->touch($session);
        if ($device->last_seen_at === null || $device->last_seen_at->lt(now()->subSeconds(60))) {
            $device->forceFill(['last_seen_at' => now()])->save();
        }
        SafeBroadcast::send(
            new PeerHeartbeat($session->id, $device->role, $data['revision'] ?? null, $data['presentationId'] ?? null, now()->getTimestampMs()),
            ['session_id' => $session->id],
        );

        return response()->noContent();
    }
}
