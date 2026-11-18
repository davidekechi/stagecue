<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        if (! $this->app->environment(['local', 'testing'])) {
            URL::forceScheme('https');
        }

        $this->configureRateLimiting();
    }

    /** LLD §7.3 */
    private function configureRateLimiting(): void
    {
        $device = fn (Request $r) => $r->user()?->getAuthIdentifier() ?? $r->ip();

        RateLimiter::for('session-create', fn (Request $r) => Limit::perMinute(10)->by('session-create:'.$r->ip()));
        RateLimiter::for('pairing', fn (Request $r) => [
            Limit::perMinute(5)->by('pairing-min:'.$r->ip()),
            Limit::perHour(20)->by('pairing-hour:'.$r->ip()),
        ]);
        RateLimiter::for('commands', fn (Request $r) => Limit::perMinute(60)->by('commands:'.$device($r)));
        RateLimiter::for('snapshots', fn (Request $r) => Limit::perMinute(120)->by('snapshots:'.$device($r)));
        RateLimiter::for('heartbeat', fn (Request $r) => Limit::perMinute(30)->by('heartbeat:'.$device($r)));
    }
}
