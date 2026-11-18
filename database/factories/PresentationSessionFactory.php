<?php

namespace Database\Factories;

use App\Modules\Sessions\Models\PresentationSession;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<PresentationSession> */
class PresentationSessionFactory extends Factory
{
    protected $model = PresentationSession::class;

    public function definition(): array
    {
        return [
            'display_name' => 'Main Hall TV',
            'status' => PresentationSession::STATUS_ACTIVE,
            'last_activity_at' => now(),
        ];
    }

    public function ended(): static
    {
        return $this->state(['status' => PresentationSession::STATUS_ENDED, 'ended_at' => now()]);
    }
}
