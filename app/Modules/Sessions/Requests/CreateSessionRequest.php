<?php

declare(strict_types=1);

namespace App\Modules\Sessions\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateSessionRequest extends FormRequest
{
    public function rules(): array
    {
        return ['displayName' => ['sometimes', 'nullable', 'string', 'min:1', 'max:60']];
    }

    public function displayName(): string
    {
        $name = trim((string) $this->input('displayName', ''));

        return $name !== '' ? $name : 'Display';
    }
}
