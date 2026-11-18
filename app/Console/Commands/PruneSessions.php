<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use App\Modules\Sessions\Models\SessionCommand;
use Illuminate\Console\Command;
use Laravel\Sanctum\PersonalAccessToken;

/** LLD §2 retention rules. Daily at 03:00 UTC. */
class PruneSessions extends Command
{
    protected $signature = 'sessions:prune';

    protected $description = 'End idle sessions and delete expired StageCue data';

    public function handle(): int
    {
        $commands = SessionCommand::query()->where('relayed_at', '<', now()->subDays(7))->delete();

        // No activity for 7 days → ended.
        $ended = PresentationSession::query()
            ->where('status', PresentationSession::STATUS_ACTIVE)
            ->where('last_activity_at', '<', now()->subDays(7))
            ->update(['status' => PresentationSession::STATUS_ENDED, 'ended_at' => now(), 'pairing_code' => null, 'pairing_token_hash' => null, 'pairing_expires_at' => null]);

        // Ended for 30 days, or untouched for 30 days → deleted (devices cascade; tokens are polymorphic, delete them first).
        $doomed = PresentationSession::query()
            ->where(fn ($q) => $q->where('status', PresentationSession::STATUS_ENDED)->where('ended_at', '<', now()->subDays(30)))
            ->orWhere('last_activity_at', '<', now()->subDays(30))
            ->pluck('id');
        $tokens = PersonalAccessToken::query()
            ->where('tokenable_type', Device::class)
            ->whereIn('tokenable_id', Device::query()->whereIn('session_id', $doomed)->select('id'))
            ->delete();
        $sessions = PresentationSession::query()->whereKey($doomed)->delete();

        // Expired tokens are useless.
        $expired = PersonalAccessToken::query()->where('expires_at', '<', now())->delete();

        $this->info("pruned commands={$commands} ended={$ended} deleted_sessions={$sessions} tokens=".($tokens + $expired));

        return self::SUCCESS;
    }
}
