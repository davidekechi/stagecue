<?php

namespace App\Models;

use App\Modules\Sessions\Models\PresentationSession;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * A StageCue account (A24): one username/password, shared by a team's laptop and phones.
 *
 * @property int $id
 * @property string $username
 * @property string $password
 */
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory;

    protected $fillable = ['username', 'password'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
        ];
    }

    /** @return HasMany<PresentationSession, $this> */
    public function presentationSessions(): HasMany
    {
        return $this->hasMany(PresentationSession::class);
    }
}
