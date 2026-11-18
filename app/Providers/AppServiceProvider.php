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
        $t = fn (string $key) => (int) config("stagecue.throttle.{$key}");

        RateLimiter::for('session-create', fn (Request $r) => Limit::perMinute($t('session_create'))->by('session-create:'.$r->ip()));
        RateLimiter::for('pairing', fn (Request $r) => [
            Limit::perMinute($t('pairing_minute'))->by('pairing-min:'.$r->ip()),
            Limit::perHour($t('pairing_hour'))->by('pairing-hour:'.$r->ip()),
        ]);
        RateLimiter::for('commands', fn (Request $r) => Limit::perMinute($t('commands'))->by('commands:'.$device($r)));
        RateLimiter::for('snapshots', fn (Request $r) => Limit::perMinute($t('snapshots'))->by('snapshots:'.$device($r)));
        RateLimiter::for('heartbeat', fn (Request $r) => Limit::perMinute($t('heartbeat'))->by('heartbeat:'.$device($r)));
    }
}
