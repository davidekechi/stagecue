<?php

declare(strict_types=1);

namespace App\Modules\Sessions\Models;

use Database\Factories\PresentationSessionFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $display_name
 * @property string $status
 * @property ?string $pairing_code
 * @property ?string $pairing_token_hash
 * @property ?Carbon $pairing_expires_at
 * @property int $pairing_failed_attempts
 * @property int $command_seq
 * @property ?array<string, mixed> $last_snapshot
 * @property ?string $last_presentation_id
 * @property ?int $last_revision
 * @property ?Carbon $last_snapshot_at
 * @property Carbon $last_activity_at
 * @property ?Carbon $ended_at
 */
class PresentationSession extends Model
{
    /** @use HasFactory<PresentationSessionFactory> */
    use HasFactory, HasUlids;

    public const STATUS_ACTIVE = 'active';

    public const STATUS_ENDED = 'ended';

    protected $table = 'presentation_sessions';

    protected $guarded = [];

    protected $hidden = ['pairing_token_hash'];

    protected function casts(): array
    {
        return [
            'pairing_expires_at' => 'datetime',
            'pairing_failed_attempts' => 'integer',
            'command_seq' => 'integer',
            'last_snapshot' => 'array',
            'last_revision' => 'integer',
            'last_snapshot_at' => 'datetime',
            'last_activity_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    protected static function newFactory(): PresentationSessionFactory
    {
        return PresentationSessionFactory::new();
    }

    /** @return HasMany<Device, $this> */
    public function devices(): HasMany
    {
        return $this->hasMany(Device::class, 'session_id');
    }

    /** @return HasOne<Device, $this> */
    public function displayDevice(): HasOne
    {
        return $this->hasOne(Device::class, 'session_id')->where('role', Device::ROLE_DISPLAY)->oldestOfMany();
    }

    /** @return HasOne<Device, $this> */
    public function activeController(): HasOne
    {
        return $this->hasOne(Device::class, 'session_id')
            ->where('role', Device::ROLE_CONTROLLER)
            ->whereNull('revoked_at')
            ->latestOfMany();
    }

    /** @return HasMany<SessionCommand, $this> */
    public function commands(): HasMany
    {
        return $this->hasMany(SessionCommand::class, 'session_id');
    }

    public function isEnded(): bool
    {
        return $this->status === self::STATUS_ENDED;
    }
}
