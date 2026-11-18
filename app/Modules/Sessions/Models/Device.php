<?php

declare(strict_types=1);

namespace App\Modules\Sessions\Models;

use Database\Factories\DeviceFactory;
use Illuminate\Auth\Authenticatable as AuthenticatableTrait;
use Illuminate\Contracts\Auth\Access\Authorizable as AuthorizableContract;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\Access\Authorizable;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\HasApiTokens;

/**
 * A Display or a Controller. The Sanctum tokenable (there are no user accounts in the MVP).
 *
 * @property string $id
 * @property string $session_id
 * @property string $role
 * @property string $name
 * @property ?string $user_agent
 * @property ?Carbon $last_seen_at
 * @property ?Carbon $revoked_at
 * @property ?Carbon $created_at
 */
class Device extends Model implements Authenticatable, AuthorizableContract
{
    /** @use HasFactory<DeviceFactory> */
    use AuthenticatableTrait, Authorizable, HasApiTokens, HasFactory, HasUlids;

    public const ROLE_DISPLAY = 'display';

    public const ROLE_CONTROLLER = 'controller';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    protected static function newFactory(): DeviceFactory
    {
        return DeviceFactory::new();
    }

    /** @return BelongsTo<PresentationSession, $this> */
    public function session(): BelongsTo
    {
        return $this->belongsTo(PresentationSession::class, 'session_id');
    }

    public function isDisplay(): bool
    {
        return $this->role === self::ROLE_DISPLAY;
    }

    public function isController(): bool
    {
        return $this->role === self::ROLE_CONTROLLER;
    }

    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }

    /** @param Builder<Device> $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('revoked_at');
    }

    public function getRememberTokenName(): string
    {
        return '';
    }
}
