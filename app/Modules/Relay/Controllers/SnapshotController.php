<?php

declare(strict_types=1);

namespace App\Modules\Relay\Controllers;

use App\Modules\Relay\Requests\SnapshotRequest;
use App\Modules\Relay\Services\RelayService;
use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use Illuminate\Http\JsonResponse;

class SnapshotController
{
    public function __construct(private readonly RelayService $relay) {}

    /** POST /sessions/{sid}/snapshots (04 §1.8) */
    public function store(SnapshotRequest $request, PresentationSession $session): JsonResponse
    {
        /** @var Device $device */
        $device = $request->user();

        return new JsonResponse($this->relay->acceptSnapshot($device, $session, $request->body()), 202);
    }

    /** GET /sessions/{sid}/state (04 §1.9) — "last known, unconfirmed" for the Controller. */
    public function show(PresentationSession $session): JsonResponse
    {
        return new JsonResponse([
            'snapshot' => $session->last_snapshot,
            'storedAt' => $session->last_snapshot_at?->getTimestampMs(),
        ]);
    }
}
