<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Modules\Sessions\Models\PresentationSession;
use Illuminate\Console\Command;

/** LLD §7.8 — clears pairing secrets after their expiry. Every 5 minutes. */
class ExpirePairings extends Command
{
    protected $signature = 'pairing:expire';

    protected $description = 'Clear expired pairing codes and tokens';

    public function handle(): int
    {
        $n = PresentationSession::query()
            ->whereNotNull('pairing_expires_at')
            ->where('pairing_expires_at', '<', now())
            ->update(['pairing_code' => null, 'pairing_token_hash' => null, 'pairing_expires_at' => null]);
        $this->info("expired {$n} pairing(s)");

        return self::SUCCESS;
    }
}
