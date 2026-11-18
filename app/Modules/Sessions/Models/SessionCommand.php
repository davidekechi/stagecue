<?php

declare(strict_types=1);

namespace App\Modules\Sessions\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * The relay log (idempotency + diagnostics). Pruned after 7 days.
 *
 * @property int $id
 * @property string $session_id
 * @property string $command_id
 * @property string $device_id
 * @property int $seq
 * @property string $name
 * @property array<string, mixed> $payload
 * @property ?int $base_revision
 * @property string $status
 * @property ?string $result_code
 * @property Carbon $relayed_at
 * @property ?Carbon $acked_at
 */
class SessionCommand extends Model
{
    /** Inserted, broadcast not yet confirmed (see ambiguity log A18). */
    public const STATUS_PENDING = 'pending';

    public const STATUS_RELAYED = 'relayed';

    public const STATUS_APPLIED = 'applied';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_DUPLICATE = 'duplicate';

    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'seq' => 'integer',
            'base_revision' => 'integer',
            'relayed_at' => 'datetime',
            'acked_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<PresentationSession, $this> */
    public function session(): BelongsTo
    {
        return $this->belongsTo(PresentationSession::class, 'session_id');
    }

    /** @return BelongsTo<Device, $this> */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function isAcked(): bool
    {
        return in_array($this->status, [self::STATUS_APPLIED, self::STATUS_REJECTED, self::STATUS_DUPLICATE], true);
    }
}
