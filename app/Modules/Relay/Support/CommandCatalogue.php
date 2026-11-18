<?php

declare(strict_types=1);

namespace App\Modules\Relay\Support;

/** 04 §4 / LLD §7.4 — the server validates SHAPE only; semantics belong to the Display reducer. */
final class CommandCatalogue
{
    public const NAMES = [
        'TIMER_SET', 'TIMER_START', 'TIMER_PAUSE', 'TIMER_RESUME', 'TIMER_RESET', 'TIMER_CLEAR',
        'MESSAGE_SHOW', 'MESSAGE_DISMISS', 'BLACKOUT_ON', 'BLACKOUT_OFF',
        'SETTINGS_UPDATE', 'PRESENTATION_NEW', 'SYNC_REQUEST',
    ];

    public const MAX_TIMER_MS = 86_399_000;

    /** @return array<string, list<mixed>> rules keyed relative to the request root */
    public static function rules(?string $name): array
    {
        $corner = 'in:tl,tr,bl,br';

        return match ($name) {
            'TIMER_SET' => [
                'payload' => ['present', 'array:durationMs'],
                'payload.durationMs' => ['required', 'integer', 'between:1000,'.self::MAX_TIMER_MS],
            ],
            'MESSAGE_SHOW' => [
                'payload' => ['present', 'array:id,text,mode,durationMs,corner'],
                'payload.id' => ['required', 'uuid'],
                'payload.text' => ['required', 'string', 'max:500', 'not_regex:/^\s*$/'],
                'payload.mode' => ['required', 'in:timed,persistent'],
                'payload.durationMs' => ['nullable', 'required_if:payload.mode,timed', 'integer', 'between:1000,600000'],
                'payload.corner' => ['nullable', $corner],
            ],
            'MESSAGE_DISMISS' => [
                'payload' => ['present', 'array:id'],
                'payload.id' => ['nullable', 'uuid'],
            ],
            'SETTINGS_UPDATE' => [
                'payload' => ['present', 'array:defaultCorner,overtimeInterruptsMessage,defaultMessageDurationMs'],
                'payload.defaultCorner' => ['sometimes', $corner],
                'payload.overtimeInterruptsMessage' => ['sometimes', 'boolean'],
                'payload.defaultMessageDurationMs' => ['sometimes', 'integer', 'between:1000,600000'],
            ],
            default => ['payload' => ['present', 'array', 'size:0']],
        };
    }
}
