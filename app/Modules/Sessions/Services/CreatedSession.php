<?php

declare(strict_types=1);

namespace App\Modules\Sessions\Services;

use App\Modules\Pairing\Services\PairingSecrets;
use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;

final readonly class CreatedSession
{
    public function __construct(public PresentationSession $session, public Device $device, public string $token, public PairingSecrets $pairing) {}
}
