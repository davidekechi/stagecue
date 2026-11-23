// T7.1 — exchanges a code or QR token for controller credentials and stores them.
import type { ApiClient, PairResponse } from '@/transport/ApiClient';
import type { DeviceRepo } from '@/storage/DeviceRepo';
import type { MetaRepo } from '@/storage/MetaRepo';
import { accountToken } from '@/account/account';

export const META_REALTIME = 'realtime';

export async function pairDevice(
    deps: { api: ApiClient; devices: DeviceRepo; meta?: MetaRepo | null; accountToken?: () => string | null },
    input: { code: string } | { token: string },
    deviceName: string,
): Promise<PairResponse> {
    const previous = await deps.devices.get().catch(() => null);
    const res = await deps.api.pair(input, deviceName, (deps.accountToken ?? accountToken)());
    // A28: pairs no longer replace each other, so leave the old pairing ourselves (best effort).
    if (previous && previous.deviceId !== res.device.id) {
        await deps.api.request<void>('DELETE', `/sessions/${previous.sessionId}/controller/self`, undefined, { bearer: previous.token }).catch(() => undefined);
    }
    await deps.devices.set({
        role: 'controller',
        deviceId: res.device.id,
        sessionId: res.session.id,
        token: res.token,
        name: deviceName,
        sessionName: res.session.displayName,
    });
    await deps.meta?.set(META_REALTIME, res.realtime).catch(() => undefined);
    return res;
}

/** Plain-language messages for pairing failures (04 §1.5). */
export function pairingErrorMessage(code: string | undefined): string {
    switch (code) {
        case 'PAIRING_INVALID':
            return 'That code doesn’t match a display. Check the code on the screen, or press “New code” there.';
        case 'PAIRING_EXPIRED':
            return 'That code has expired. Press “New code” on the display and try again.';
        case 'ACCOUNT_MISMATCH':
            return 'This display is logged in to a different account. Log in to the same account on this phone and on the display.';
        case 'ACCOUNT_REQUIRED':
        case 'UNAUTHENTICATED':
            return 'Your login has expired. Log in again, then pair.';
        case 'CONTROLLER_LIMIT':
            return 'This display already has the most phones it can pair. Unpair one on the display first.';
        case 'RATE_LIMITED':
            return 'Too many attempts. Wait a minute, then try again.';
        case 'VALIDATION_FAILED':
            return 'Enter the 6-character code shown on the display.';
        case 'NETWORK':
        case 'TIMEOUT':
            return 'Can’t reach StageCue. Check this phone’s internet connection.';
        default:
            return 'Pairing didn’t work. Try again.';
    }
}
