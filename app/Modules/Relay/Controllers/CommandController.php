<?php

declare(strict_types=1);

namespace App\Modules\Relay\Controllers;

use App\Modules\Relay\Requests\CommandRequest;
use App\Modules\Relay\Services\RelayService;
use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use Illuminate\Http\JsonResponse;

class CommandController
{
    public function __construct(private readonly RelayService $relay) {}

    /** POST /sessions/{sid}/commands (04 §1.7) — 202 means relayed, NOT applied. */
    public function store(CommandRequest $request, PresentationSession $session): JsonResponse
    {
        /** @var Device $device */
        $device = $request->user();
        $v = $request->validated();
        $result = $this->relay->relayCommand($device, $session, [
            'commandId' => strtolower($v['commandId']),
            'name' => $v['name'],
            'payload' => $v['payload'] ?? [],
            'baseRevision' => $v['baseRevision'],
            'issuedAt' => (int) $v['issuedAt'],
        ]);

        return new JsonResponse($result->toArray(), $result->duplicate ? 200 : 202);
    }
}
