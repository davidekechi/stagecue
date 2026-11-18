<?php

declare(strict_types=1);

namespace App\Modules\Relay\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

/** LLD §7.4 — shape only; the state itself is the Display's business. */
class SnapshotRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'v' => ['required', 'integer', 'in:1'],
            'presentationId' => ['required', 'ulid'],
            'revision' => ['required', 'integer', 'min:0'],
            'capturedAtWall' => ['required', 'integer', 'min:0'],
            'state' => ['required', 'array'],
            'computed' => ['required', 'array:timerRemainingMs,overtimeMs,messageRemainingMs'],
            'computed.timerRemainingMs' => ['present', 'nullable', 'integer'],
            'computed.overtimeMs' => ['required', 'integer', 'min:0'],
            'computed.messageRemainingMs' => ['present', 'nullable', 'integer'],
            'lastEvents' => ['sometimes', 'array', 'max:20'],
            'lastEvents.*' => ['string', 'max:32'],
            'acks' => ['sometimes', 'array', 'max:50'],
            'acks.*.commandId' => ['required', 'uuid'],
            'acks.*.seq' => ['nullable', 'integer'],
            'acks.*.result' => ['required', 'in:APPLIED,REJECTED,DUPLICATE'],
            'acks.*.code' => ['nullable', 'in:INVALID_STATE,INVALID_PAYLOAD,STALE,STALE_VIEW,DUPLICATE,UNKNOWN_COMMAND'],
            'acks.*.message' => ['nullable', 'string', 'max:500'],
            'acks.*.latencyMs' => ['nullable', 'integer', 'min:0', 'max:600000'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $state = $this->input('state');
            if (is_array($state) && strlen((string) json_encode($state)) > (int) config('stagecue.snapshot_max_bytes')) {
                $v->errors()->add('state', 'The state may not be larger than 16 KB.');
            }
        });
    }

    /** The body exactly as sent (validated() would drop unvalidated nested state keys). */
    public function body(): array
    {
        $raw = $this->json()->all();

        return [
            'v' => 1,
            'presentationId' => (string) $raw['presentationId'],
            'revision' => (int) $raw['revision'],
            'capturedAtWall' => (int) $raw['capturedAtWall'],
            'state' => $raw['state'],
            'computed' => $raw['computed'],
            'lastEvents' => $raw['lastEvents'] ?? [],
            'acks' => $raw['acks'] ?? [],
        ];
    }
}
