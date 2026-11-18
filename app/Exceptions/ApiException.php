<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/** A contract error (04 §1.13), rendered as {"error": {code, message, retryable}}. */
class ApiException extends RuntimeException
{
    /** @param array<string, string> $headers */
    public function __construct(
        public readonly string $errorCode,
        public readonly int $status,
        string $message = '',
        public readonly bool $retryable = false,
        public readonly array $headers = [],
    ) {
        parent::__construct($message !== '' ? $message : $errorCode);
    }

    public static function notMember(): self
    {
        return new self('NOT_SESSION_MEMBER', 403, 'This device does not belong to the session.');
    }

    public static function forbiddenRole(): self
    {
        return new self('FORBIDDEN_ROLE', 403, 'This device role cannot perform that action.');
    }

    public static function sessionNotFound(): self
    {
        return new self('SESSION_NOT_FOUND', 404, 'Session not found.');
    }

    public static function sessionEnded(): self
    {
        return new self('SESSION_ENDED', 410, 'The session has ended.');
    }

    public static function pairingInvalid(): self
    {
        return new self('PAIRING_INVALID', 404, 'That pairing code is not valid.');
    }

    public static function pairingExpired(): self
    {
        return new self('PAIRING_EXPIRED', 410, 'That pairing code has expired. Ask for a new one.');
    }

    public static function invalidCredentials(): self
    {
        return new self('INVALID_CREDENTIALS', 422, 'That username and password don’t match an account.');
    }

    public static function registrationClosed(): self
    {
        return new self('REGISTRATION_CLOSED', 403, 'New accounts can’t be created right now. Ask your team for the login.');
    }

    public static function accountRequired(): self
    {
        return new self('ACCOUNT_REQUIRED', 401, 'Log in to continue.');
    }

    public static function accountMismatch(): self
    {
        return new self('ACCOUNT_MISMATCH', 403, 'This display is logged in to a different account. Log in with the same account on both devices.');
    }

    public static function relayUnavailable(): self
    {
        return new self('RELAY_UNAVAILABLE', 503, 'The real-time relay is unavailable. Try again.', true);
    }
}
