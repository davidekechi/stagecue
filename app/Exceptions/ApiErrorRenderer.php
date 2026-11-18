<?php

declare(strict_types=1);

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

/** LLD §7.7 — one JSON error shape for everything under api/*. */
class ApiErrorRenderer
{
    public function __invoke(Throwable $e, Request $request): ?JsonResponse
    {
        if (! $request->is('api/*')) {
            return null;
        }

        return match (true) {
            $e instanceof ApiException => self::json($e->errorCode, $e->getMessage(), $e->status, $e->retryable, $e->headers),
            $e instanceof AuthenticationException => self::json('UNAUTHENTICATED', 'Missing, expired or revoked token.', 401),
            $e instanceof ValidationException => self::json('VALIDATION_FAILED', $e->getMessage(), 422, false, [], ['errors' => $e->errors()]),
            $e instanceof ThrottleRequestsException => self::json('RATE_LIMITED', 'Too many requests. Slow down.', 429, true, $e->getHeaders()),
            $e instanceof ModelNotFoundException,
            $e instanceof NotFoundHttpException && $e->getPrevious() instanceof ModelNotFoundException => self::json('SESSION_NOT_FOUND', 'Session not found.', 404),
            $e instanceof NotFoundHttpException => self::json('NOT_FOUND', 'Not found.', 404),
            $e instanceof HttpExceptionInterface => self::json('HTTP_'.$e->getStatusCode(), $e->getMessage() ?: 'Request failed.', $e->getStatusCode(), $e->getStatusCode() >= 500, $e->getHeaders()),
            default => config('app.debug') ? null : self::json('SERVER_ERROR', 'Something went wrong.', 500, true),
        };
    }

    /**
     * @param  array<string, mixed>  $headers
     * @param  array<string, mixed>  $extra
     */
    public static function json(string $code, string $message, int $status, bool $retryable = false, array $headers = [], array $extra = []): JsonResponse
    {
        return new JsonResponse(['error' => ['code' => $code, 'message' => $message, 'retryable' => $retryable] + $extra], $status, $headers);
    }
}
