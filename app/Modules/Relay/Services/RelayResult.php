<?php

declare(strict_types=1);

namespace App\Modules\Relay\Services;

use App\Modules\Sessions\Models\SessionCommand;

final readonly class RelayResult
{
    public function __construct(public SessionCommand $command, public bool $duplicate) {}

    public function toArray(): array
    {
        $out = [
            'commandId' => $this->command->command_id,
            'seq' => $this->command->seq,
            'relayedAt' => $this->command->relayed_at->getTimestampMs(),
            'status' => $this->command->status,
        ];
        if ($this->duplicate) {
            $out['duplicate'] = true;
            $out['resultCode'] = $this->command->result_code;
        }

        return $out;
    }
}
