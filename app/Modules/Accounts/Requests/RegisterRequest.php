<?php

declare(strict_types=1);

namespace App\Modules\Accounts\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge(['username' => strtolower(trim((string) $this->input('username')))]);
    }

    public function rules(): array
    {
        return [
            'username' => ['required', 'string', 'min:3', 'max:40', 'regex:/^[a-z0-9._-]+$/', Rule::unique('users', 'username')],
            'password' => ['required', 'string', 'min:8', 'max:200', 'confirmed'],
        ];
    }

    public function messages(): array
    {
        return [
            'username.regex' => 'Use letters, numbers, dots, dashes or underscores.',
            'username.unique' => 'That username is taken.',
            'password.confirmed' => 'The passwords don’t match.',
        ];
    }
}
