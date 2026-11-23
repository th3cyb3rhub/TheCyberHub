"use client";

import React from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface Props {
    /** Where the prompt appears, for the opt-in event */
    source: 'notifications_page' | 'first_notification';
    /** Floating sits above the page corner; inline sits in the flow */
    variant?: 'inline' | 'floating';
}

/**
 * A dismissible ask to turn on push. It is only mounted where the member has just seen a
 * notification, so it never greets anyone on their first page load.
 */
export default function PushPrompt({ source, variant = 'inline' }: Props) {
    const push = usePushNotifications();
    if (!push.canPrompt) return null;

    const position = variant === 'floating'
        ? 'fixed z-40 left-4 right-4 bottom-24 md:bottom-6 md:left-auto md:right-6 md:max-w-sm shadow-2xl bg-[var(--color-background)] backdrop-blur-xl'
        : 'mb-4';

    return (
        <section aria-labelledby="push-prompt-title" className={`${position} rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent p-4`}>
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-4 h-4 text-orange-400" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 id="push-prompt-title" className="text-sm font-semibold text-gray-900 dark:text-white">Hear about it when you are away</h2>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Turn on push notifications to get replies and mentions on this device, even with the site closed.</p>
                    {push.error && <p role="alert" className="text-xs text-red-400 mt-2">{push.error}</p>}
                    <div className="flex gap-2 mt-3">
                        <button
                            type="button"
                            onClick={() => { void push.enable(source); }}
                            disabled={push.busy}
                            className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5"
                        >
                            {push.busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                            Turn on
                        </button>
                        <button
                            type="button"
                            onClick={push.dismiss}
                            className="px-3 py-1.5 bg-gray-500/10 hover:bg-gray-500/20 border border-gray-500/20 text-gray-900 dark:text-white rounded-lg text-xs font-medium transition-colors"
                        >
                            Not now
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
