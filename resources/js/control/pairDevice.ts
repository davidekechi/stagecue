// T7.1 — exchanges a code or QR token for controller credentials and stores them.
import type { ApiClient, PairResponse } from '@/transport/ApiClient';
import type { DeviceRepo } from '@/storage/DeviceRepo';
import type { MetaRepo } from '@/storage/MetaRepo';

export const META_REALTIME = 'realtime';

export async function pairDevice(
    deps: { api: ApiClient; devices: DeviceRepo; meta?: MetaRepo | null },
    input: { code: string } | { token: string },
    deviceName: string,
): Promise<PairResponse> {
    const res = await deps.api.pair(input, deviceName);
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
