"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { useNotificationSocket } from '@/context/NotificationProvider';
import PushPrompt from './PushPrompt';

/** Offers push once a notification has arrived while the member is on the site (the notifications page has its own) */
export default function LivePushPrompt() {
    const { liveArrivals } = useNotificationSocket();
    const pathname = usePathname();
    if (!liveArrivals || pathname === '/notifications') return null;
    return <PushPrompt source="first_notification" variant="floating" />;
}
