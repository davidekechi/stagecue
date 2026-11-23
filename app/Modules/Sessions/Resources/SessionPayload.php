<?php

declare(strict_types=1);

namespace App\Modules\Sessions\Resources;

use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use App\Support\ClientConfig;

/** JSON shapes for 04 §1.1–1.5. */
final class SessionPayload
{
    /** @return array{id: string, displayName: string, status: string, accountId: int|null} */
    public static function session(PresentationSession $s): array
    {
        return ['id' => $s->id, 'displayName' => $s->display_name, 'status' => $s->status, 'accountId' => $s->user_id];
    }

    /** @return array{id: string, role: string} */
    public static function device(Device $d): array
    {
        return ['id' => $d->id, 'role' => $d->role];
    }

    /** GET /sessions/{sid} for either role. The plain pairing token is never stored, so only the code is shown. */
    public static function show(PresentationSession $s, Device $viewer): array
    {
        $controller = $s->activeController;
        $controllers = $s->activeControllers()->get();
        $pairing = null;
        if ($viewer->isDisplay() && $s->pairing_code !== null && $s->pairing_expires_at?->isFuture()) {
            $pairing = ['code' => $s->pairing_code, 'expiresAt' => $s->pairing_expires_at->getTimestampMs()];
        }

        return [
            'session' => self::session($s),
            'device' => self::device($viewer),
            // `controller` (the most recent phone) is kept for older clients; A28 adds the full list.
            'controller' => $controller ? ['id' => $controller->id, 'name' => $controller->name, 'pairedAt' => $controller->created_at?->getTimestampMs()] : null,
            'controllers' => $controllers->map(fn (Device $c) => ['id' => $c->id, 'name' => $c->name, 'pairedAt' => $c->created_at?->getTimestampMs(), 'lastSeenAt' => $c->last_seen_at?->getTimestampMs()])->values()->all(),
            'pairing' => $pairing,
            'realtime' => ClientConfig::realtime(),
            'serverTime' => now()->getTimestampMs(),
        ];
    }
}
