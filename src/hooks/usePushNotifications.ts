import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/queries/useNotifications';
import { usePushPublicKey } from '@/hooks/queries/usePushKey';
import { pushErrorCode } from '@/lib/api/push';
import { trackEvent } from '@/lib/analytics';
import {
    currentPermission,
    isPushSupported,
    readPromptDismissed,
    subscribeThisDevice,
    unsubscribeThisDevice,
    writePromptDismissed,
} from '@/lib/push';

export type PushStatus =
    /** Still finding out what the browser and the server allow */
    | 'checking'
    /** The browser cannot do push */
    | 'unsupported'
    /** The server has push switched off: show nothing */
    | 'disabled'
    /** The member blocked notifications for this site */
    | 'denied'
    /** The key or the settings could not be loaded */
    | 'error'
    | 'off'
    | 'on';

export const PUSH_LIMIT_MESSAGE = 'You already receive push notifications on 5 devices. Turn them off on one of those devices, then try again.';

function failureMessage(err: unknown): string {
    if (pushErrorCode(err) === 'PUSH_LIMIT_REACHED') return PUSH_LIMIT_MESSAGE;
    return 'Push notifications could not be turned on. Please try again.';
}

export function usePushNotifications() {
    const { user } = useAuth();
    const [supported, setSupported] = useState<boolean | null>(null);
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [dismissed, setDismissed] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Browser capabilities are only known on the client; until then nothing shows, so server and client markup match
    useEffect(() => {
        setSupported(isPushSupported());
        setPermission(currentPermission());
        setDismissed(readPromptDismissed());
    }, []);

    const active = supported === true && !!user;
    const key = usePushPublicKey(active);
    const prefs = useNotificationPreferences(active && key.data != null);
    const update = useUpdateNotificationPreferences();
    const { refetch: refetchKey } = key;

    const enabled = !!prefs.data?.push?.enabled && permission === 'granted';

    let status: PushStatus;
    if (supported === null) status = 'checking';
    else if (!supported) status = 'unsupported';
    else if (!user || key.isLoading) status = 'checking';
    else if (key.isError) status = 'error';
    else if (key.data == null) status = 'disabled';
    else if (permission === 'denied') status = 'denied';
    else if (prefs.isLoading) status = 'checking';
    else if (prefs.isError) status = 'error';
    else status = enabled ? 'on' : 'off';

    const enable = useCallback(async (source: string): Promise<boolean> => {
        const publicKey = key.data;
        if (!publicKey || busy) return false;
        setBusy(true);
        setError(null);
        try {
            // Asked first, straight from the click: browsers only show the question for a user gesture
            const result = await Notification.requestPermission();
            setPermission(result);
            if (result !== 'granted') {
                if (result === 'default') setError('Permission was not given, so push notifications stay off.');
                return false;
            }
            await subscribeThisDevice(publicKey);
            await update.mutateAsync({ push: { enabled: true } });
            trackEvent('push_opt_in', { source });
            return true;
        } catch (err) {
            if (pushErrorCode(err) === 'PUSH_DISABLED') void refetchKey();
            setError(failureMessage(err));
            return false;
        } finally {
            setBusy(false);
        }
    }, [key.data, busy, update, refetchKey]);

    const disable = useCallback(async (): Promise<boolean> => {
        if (busy) return false;
        setBusy(true);
        setError(null);
        try {
            await unsubscribeThisDevice();
            await update.mutateAsync({ push: { enabled: false } });
            return true;
        } catch {
            setError('Push notifications could not be turned off. Please try again.');
            return false;
        } finally {
            setBusy(false);
        }
    }, [busy, update]);

    const dismiss = useCallback(() => {
        setDismissed(true);
        writePromptDismissed();
    }, []);

    return {
        status,
        busy,
        error,
        enable,
        disable,
        dismissed,
        dismiss,
        /** The prompt is only worth showing while turning push on is possible and has not been declined */
        canPrompt: status === 'off' && permission !== 'denied' && !dismissed,
        retry: () => { void refetchKey(); void prefs.refetch(); },
    };
}
