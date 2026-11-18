<?php

declare(strict_types=1);

namespace App\Modules\Pairing\Services;

final readonly class PairingSecrets
{
    public function __construct(public string $code, public string $token, public int $expiresAt, public string $url) {}

    /** @return array{code: string, token: string, expiresAt: int, url: string} */
    public function toArray(): array
    {
        return ['code' => $this->code, 'token' => $this->token, 'expiresAt' => $this->expiresAt, 'url' => $this->url];
    }
}
