<?php

declare(strict_types=1);

namespace App\Modules\Pairing\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** LLD §7.4 — exactly one of `code` | `token`. */
class PairRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'code' => ['required_without:token', 'prohibits:token', 'nullable', 'string', 'regex:/^[2-9A-HJKMNP-Z]{6}$/i'],
            'token' => ['required_without:code', 'prohibits:code', 'nullable', 'string', 'size:43', 'regex:/^[A-Za-z0-9_-]+$/'],
            'deviceName' => ['required', 'string', 'min:1', 'max:60'],
        ];
    }
}
