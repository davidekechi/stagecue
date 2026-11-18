<?php

declare(strict_types=1);

namespace App\Modules\Relay\Requests;

use App\Modules\Relay\Support\CommandCatalogue;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CommandRequest extends FormRequest
{
    public function rules(): array
    {
        $name = $this->input('name');

        return [
            'v' => ['required', 'integer', 'in:1'],
            'commandId' => ['required', 'uuid'],
            'name' => ['required', 'string', Rule::in(CommandCatalogue::NAMES)],
            'baseRevision' => ['present', 'nullable', 'integer', 'min:0'],
            'issuedAt' => ['required', 'integer', 'min:0'],
        ] + CommandCatalogue::rules(is_string($name) ? $name : null);
    }
}
