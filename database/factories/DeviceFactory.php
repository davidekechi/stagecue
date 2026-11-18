<?php

namespace Database\Factories;

use App\Modules\Sessions\Models\Device;
use App\Modules\Sessions\Models\PresentationSession;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Device> */
class DeviceFactory extends Factory
{
    protected $model = Device::class;

    public function definition(): array
    {
        return [
            'session_id' => PresentationSession::factory(),
            'role' => Device::ROLE_DISPLAY,
            'name' => 'Display',
        ];
    }

    public function controller(): static
    {
        return $this->state(['role' => Device::ROLE_CONTROLLER, 'name' => 'Phone']);
    }

    public function revoked(): static
    {
        return $this->state(['revoked_at' => now()]);
    }
}
