<?php

declare(strict_types=1);

namespace App\Modules\Accounts\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge(['email' => strtolower(trim((string) $this->input('email')))]);
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:254', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:8', 'max:200', 'confirmed'],
        ];
    }

    public function messages(): array
    {
        return [
            'email.email' => 'Enter a valid email address.',
            'email.unique' => 'An account with that email already exists. Log in instead.',
            'password.confirmed' => 'The passwords don’t match.',
        ];
    }
}
