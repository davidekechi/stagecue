<?php

declare(strict_types=1);

namespace App\Modules\Pairing\Controllers;

use App\Modules\Pairing\Requests\PairRequest;
use App\Modules\Pairing\Services\PairingService;
use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use App\Modules\Sessions\Resources\SessionPayload;
use App\Support\ClientConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PairingController
{
    public function __construct(private readonly PairingService $pairing) {}

    /** POST /pairings (04 §1.5) */
    public function store(PairRequest $request): JsonResponse
    {
        $result = $this->pairing->consume(
            $request->filled('code') ? (string) $request->input('code') : null,
            $request->filled('token') ? (string) $request->input('token') : null,
            trim((string) $request->input('deviceName')),
            $request->userAgent(),
            $request->user()?->getKey(),
        );

        return new JsonResponse([
            'session' => ['id' => $result->session->id, 'displayName' => $result->session->display_name],
            'device' => SessionPayload::device($result->device),
            'token' => $result->token,
            'realtime' => ClientConfig::realtime(),
            'serverTime' => now()->getTimestampMs(),
        ], 201);
    }

    /** POST /sessions/{sid}/pairing/regenerate (04 §1.4) */
    public function regenerate(PresentationSession $session): JsonResponse
    {
        return new JsonResponse(['pairing' => $this->pairing->issue($session)->toArray()]);
    }

    /** DELETE /sessions/{sid}/controller (04 §1.6) */
    public function revoke(PresentationSession $session): Response
    {
        $this->pairing->revokeController($session, 'revoked_by_display');

        return response()->noContent();
    }

    /** DELETE /sessions/{sid}/controller/self (04 §1.6) */
    public function leave(Request $request, PresentationSession $session): Response
    {
        /** @var Device $device */
        $device = $request->user();
        $this->pairing->revokeController($session, 'left', $device);

        return response()->noContent();
    }
}
