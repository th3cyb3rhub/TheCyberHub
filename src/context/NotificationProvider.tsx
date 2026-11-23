"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { API_URL } from '@/lib/api';
import * as api from '@/lib/api/notifications';
import type { NotificationData, NotificationPage } from '@/types/notifications';

export type { NotificationData } from '@/types/notifications';

/** Every list the notifications page has open lives under this key */
export const NOTIFICATION_LISTS = ['notifications', 'list'] as const;

/** At most this many pop-ups in a burst; the rest become one summary toast */
const TOAST_BURST = 2;
const TOAST_WINDOW_MS = 6000;

interface NotificationContextValue {
    socket: Socket | null;
    connected: boolean;
    /** The most recent notifications, for the bell menu */
    notifications: NotificationData[];
    unreadCount: number;
    /** How many notifications have arrived live in this visit; 0 until the first one */
    liveArrivals: number;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    deleteAll: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
    socket: null,
    connected: false,
    notifications: [],
    unreadCount: 0,
    liveArrivals: 0,
    markAsRead: async () => { },
    markAllAsRead: async () => { },
    deleteNotification: async () => { },
    deleteAll: async () => { },
});

export const useNotificationSocket = () => useContext(NotificationContext);

type Lists = InfiniteData<NotificationPage> | undefined;

function patchLists(qc: QueryClient, fn: (items: NotificationData[]) => NotificationData[]) {
    qc.setQueriesData<Lists>({ queryKey: NOTIFICATION_LISTS }, (old) =>
        old && { ...old, pages: old.pages.map((p) => ({ ...p, data: fn(p.data) })) });
}

/** Where an updated group lands: gone from wherever it was, then first in every list it belongs in */
function moveToTop(qc: QueryClient, updated: NotificationData) {
    for (const [key, old] of qc.getQueriesData<Lists>({ queryKey: NOTIFICATION_LISTS })) {
        if (!old) continue;
        const typeFilter = key[4] as string | null | undefined;
        const existed = old.pages.some((p) => p.data.some((n) => n._id === updated._id));
        let pages = old.pages.map((p) => ({ ...p, data: p.data.filter((n) => n._id !== updated._id) }));
        if (!typeFilter || typeFilter === updated.type) {
            pages[0] = { ...pages[0], data: [updated, ...pages[0].data] };
            // A row this list did not hold yet makes it one longer
            if (!existed) pages = pages.map((p) => ({ ...p, pagination: { ...p.pagination, total: p.pagination.total + 1 } }));
        }
        qc.setQueryData<Lists>(key, { ...old, pages });
    }
}

/** What the caches know about a notification, if anything */
function knownRead(qc: QueryClient, known: NotificationData[], id: string): boolean | null {
    const local = known.find((n) => n._id === id);
    if (local) return local.read;
    for (const [, old] of qc.getQueriesData<Lists>({ queryKey: NOTIFICATION_LISTS })) {
        const hit = old?.pages.flatMap((p) => p.data).find((n) => n._id === id);
        if (hit) return hit.read;
    }
    return null;
}

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
    const { token, user } = useAuth();
    const { addToast } = useToast();
    const qc = useQueryClient();
    const userId = user?.id;
    const addToastRef = useRef(addToast);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const [notifications, setNotifications] = useState<NotificationData[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [liveArrivals, setLiveArrivals] = useState(0);
    const notificationsRef = useRef<NotificationData[]>([]);
    const burst = useRef<{ shown: number; extra: number; timer: ReturnType<typeof setTimeout> | null }>({ shown: 0, extra: 0, timer: null });

    useEffect(() => { addToastRef.current = addToast; }, [addToast]);

    // The one way the list changes. The ref moves with it at once, so a socket event arriving in the same tick
    // as an optimistic change builds on that change instead of on an older copy.
    const commit = useCallback((next: NotificationData[] | ((prev: NotificationData[]) => NotificationData[])) => {
        const value = typeof next === 'function' ? next(notificationsRef.current) : next;
        notificationsRef.current = value;
        setNotifications(value);
    }, []);

    const refreshCount = useCallback(async () => {
        try {
            setUnreadCount((await api.getUnreadCount()).count);
        } catch {
            // The badge is a convenience; the next event corrects it
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        if (!token) return;
        try {
            const [page] = await Promise.all([api.getNotifications({ limit: 20 }), refreshCount()]);
            if (page.success) commit(page.data);
        } catch {
            // Non-critical
        }
    }, [token, refreshCount, commit]);

    const markAsRead = useCallback(async (id: string) => {
        const target = notificationsRef.current.find((n) => n._id === id);
        if (target?.read) return;
        commit((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
        patchLists(qc, (items) => items.map((n) => (n._id === id ? { ...n, read: true } : n)));
        if (target) setUnreadCount((c) => Math.max(0, c - 1));
        try {
            await api.markNotificationRead(id);
        } catch {
            commit((prev) => prev.map((n) => (n._id === id ? { ...n, read: false } : n)));
            patchLists(qc, (items) => items.map((n) => (n._id === id ? { ...n, read: false } : n)));
            refreshCount();
            addToastRef.current({ variant: 'error', message: 'Could not mark it as read.' });
        }
    }, [qc, refreshCount, commit]);

    const markAllAsRead = useCallback(async () => {
        try {
            await api.markAllNotificationsRead();
            commit((prev) => prev.map((n) => ({ ...n, read: true })));
            patchLists(qc, (items) => items.map((n) => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch {
            addToastRef.current({ variant: 'error', message: 'Could not mark everything as read.' });
        }
    }, [qc, commit]);

    const deleteNotification = useCallback(async (id: string) => {
        const before = notificationsRef.current;
        const target = before.find((n) => n._id === id);
        commit((prev) => prev.filter((n) => n._id !== id));
        patchLists(qc, (items) => items.filter((n) => n._id !== id));
        if (target && !target.read) setUnreadCount((c) => Math.max(0, c - 1));
        try {
            await api.deleteNotification(id);
            // The rest of the list may have more to show now
            qc.invalidateQueries({ queryKey: NOTIFICATION_LISTS });
            refreshCount();
        } catch {
            if (target) {
                // Put it back where it was, keeping anything that arrived in the meantime
                const above = before[before.findIndex((n) => n._id === id) - 1]?._id;
                commit((prev) => {
                    if (prev.some((n) => n._id === id)) return prev;
                    const at = above ? prev.findIndex((n) => n._id === above) + 1 : 0;
                    return [...prev.slice(0, at), target, ...prev.slice(at)];
                });
            }
            qc.invalidateQueries({ queryKey: NOTIFICATION_LISTS });
            refreshCount();
            addToastRef.current({ variant: 'error', message: 'Could not delete the notification.' });
        }
    }, [qc, refreshCount, commit]);

    const deleteAll = useCallback(async () => {
        try {
            await api.deleteAllNotifications();
            commit([]);
            setUnreadCount(0);
            qc.invalidateQueries({ queryKey: NOTIFICATION_LISTS });
        } catch {
            addToastRef.current({ variant: 'error', message: 'Could not clear your notifications.' });
        }
    }, [qc, commit]);

    useEffect(() => {
        const state = burst.current;
        if (!token || !userId) {
            commit([]);
            setUnreadCount(0);
            setLiveArrivals(0);
            return;
        }

        const newSocket = io(API_URL, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30000,
            timeout: 20000,
        });

        fetchNotifications();

        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);

        // A burst of arrivals must not bury the page under pop-ups
        const announce = (data: NotificationData) => {
            if (state.shown < TOAST_BURST) {
                state.shown += 1;
                addToastRef.current({
                    title: data.title || 'New notification',
                    message: data.message || 'You have a new update.',
                    variant: 'info',
                });
            } else {
                state.extra += 1;
            }
            if (!state.timer) {
                state.timer = setTimeout(() => {
                    if (state.extra > 0) {
                        addToastRef.current({
                            title: 'New notifications',
                            message: `${state.extra} more ${state.extra === 1 ? 'update' : 'updates'} waiting for you.`,
                            variant: 'info',
                        });
                    }
                    state.shown = 0;
                    state.extra = 0;
                    state.timer = null;
                }, TOAST_WINDOW_MS);
            }
        };

        const onNewNotification = (data: NotificationData) => {
            if (notificationsRef.current.some((n) => n._id === data._id)) return;
            commit((prev) => [data, ...prev].slice(0, 50));
            setUnreadCount((c) => c + 1);
            setLiveArrivals((c) => c + 1);
            qc.invalidateQueries({ queryKey: NOTIFICATION_LISTS });
            announce(data);
        };

        // Someone joined a group: the same row, newer and unread again. A group is one unread, however many people are in it.
        const onNotificationUpdated = (data: NotificationData) => {
            const updated = { ...data, read: false };
            const wasRead = knownRead(qc, notificationsRef.current, data._id);
            commit((prev) => [updated, ...prev.filter((n) => n._id !== data._id)].slice(0, 50));
            moveToTop(qc, updated);
            if (wasRead === null) refreshCount();
            else if (wasRead) setUnreadCount((c) => c + 1);
            setLiveArrivals((c) => c + 1);
            announce(updated);
        };

        newSocket.on('connect', onConnect);
        newSocket.on('disconnect', onDisconnect);
        newSocket.on('connect_error', onDisconnect);
        newSocket.on('newNotification', onNewNotification);
        newSocket.on('notificationUpdated', onNotificationUpdated);
        setSocket(newSocket);

        return () => {
            newSocket.off('connect', onConnect);
            newSocket.off('disconnect', onDisconnect);
            newSocket.off('connect_error', onDisconnect);
            newSocket.off('newNotification', onNewNotification);
            newSocket.off('notificationUpdated', onNotificationUpdated);
            newSocket.disconnect();
            if (state.timer) clearTimeout(state.timer);
            state.timer = null;
            state.shown = 0;
            state.extra = 0;
            setSocket(null);
            setConnected(false);
        };
    }, [token, userId, qc, fetchNotifications, refreshCount, commit]);

    return (
        <NotificationContext.Provider value={{
            socket,
            connected,
            notifications,
            unreadCount,
            liveArrivals,
            markAsRead,
            markAllAsRead,
            deleteNotification,
            deleteAll,
        }}>
            {children}
        </NotificationContext.Provider>
    );
};
