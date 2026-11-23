"use client";

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNotificationPreferences } from '@/hooks/queries/useNotifications';
import { usePushPublicKey } from '@/hooks/queries/usePushKey';
import { currentPermission, isPushSupported, subscribeThisDevice } from '@/lib/push';

/**
 * Subscriptions expire after 90 idle days, so a browser that has push on tells the server it is still there
 * on load. Renders nothing, and does nothing until permission is already granted.
 */
export default function PushSync() {
    const { user } = useAuth();
    const [granted, setGranted] = useState(false);
    const syncedFor = useRef<string | null>(null);

    useEffect(() => {
        setGranted(isPushSupported() && currentPermission() === 'granted');
    }, []);

    const active = granted && !!user;
    const prefs = useNotificationPreferences(active);
    const pushOn = active && !!prefs.data?.push?.enabled;
    const key = usePushPublicKey(pushOn);
    const publicKey = key.data;
    const userId = user?.id;

    useEffect(() => {
        if (!pushOn || !publicKey || !userId || syncedFor.current === userId) return;
        syncedFor.current = userId;
        subscribeThisDevice(publicKey).catch(() => {
            // A refresh is best effort: the member is not waiting on it, and the next load tries again
            syncedFor.current = null;
        });
    }, [pushOn, publicKey, userId]);

    return null;
}
