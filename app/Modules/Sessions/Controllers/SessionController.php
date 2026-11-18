<?php

declare(strict_types=1);

namespace App\Modules\Sessions\Controllers;

use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use App\Modules\Sessions\Requests\CreateSessionRequest;
use App\Modules\Sessions\Resources\SessionPayload;
use App\Modules\Sessions\Services\SessionService;
use App\Support\ClientConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class SessionController
{
    public function __construct(private readonly SessionService $sessions) {}

    /** POST /sessions (04 §1.1) */
    public function store(CreateSessionRequest $request): JsonResponse
    {
        $created = $this->sessions->create($request->displayName(), $request->userAgent(), $request->user()?->getKey());

        return new JsonResponse([
            'session' => SessionPayload::session($created->session),
            'device' => SessionPayload::device($created->device),
            'token' => $created->token,
            'pairing' => $created->pairing->toArray(),
            'realtime' => ClientConfig::realtime(),
            'serverTime' => now()->getTimestampMs(),
        ], 201);
    }

    /** GET /sessions/{sid} (04 §1.2) */
    public function show(Request $request, PresentationSession $session): JsonResponse
    {
        /** @var Device $device */
        $device = $request->user();
        $this->sessions->touch($session);

        return new JsonResponse(SessionPayload::show($session, $device));
    }

    /** DELETE /sessions/{sid} (04 §1.3) */
    public function destroy(PresentationSession $session): Response
    {
        $this->sessions->end($session);

        return response()->noContent();
    }
}
