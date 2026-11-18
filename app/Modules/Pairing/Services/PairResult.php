<?php

declare(strict_types=1);

namespace App\Modules\Pairing\Services;

use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;

final readonly class PairResult
{
    public function __construct(public PresentationSession $session, public Device $device, public string $token) {}
}
