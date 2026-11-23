"use client";

import React from 'react';
import { Loader2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import ToggleSwitch from '@/components/profile/ToggleSwitch';

/** The push switch for the profile Notifications tab. Hidden when the server has push turned off. */
export default function PushSettings() {
    const push = usePushNotifications();
    const { status } = push;

    if (status === 'disabled') return null;

    if (status === 'checking') {
        return (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8" role="status" aria-label="Checking push notification support">
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" aria-hidden="true" />
            </div>
        );
    }

    const hint = (() => {
        switch (status) {
            case 'unsupported':
                return 'This browser cannot show push notifications. Try a recent version of Chrome, Edge, Firefox or Safari. On an iPhone or iPad, add the site to your Home Screen first.';
            case 'denied':
                return 'Notifications are blocked for this site in your browser. Allow them in the site settings (usually under the lock icon in the address bar), then reload this page.';
            case 'on':
                return 'Updates go to every browser where you have allowed notifications, when you are not on the site. Quiet hours and your in-app choices still apply.';
            case 'error':
                return 'Push settings could not be loaded.';
            default:
                return 'Get replies, mentions and other updates even when the site is closed. Your browser will ask for permission.';
        }
    })();

    return (
        <section aria-labelledby="push-title" className="rounded-2xl border border-white/10 bg-[var(--color-background)] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h2 id="push-title" className="text-lg font-semibold text-gray-900 dark:text-white">Push notifications for your account</h2>
                    <p id="push-hint" className="text-sm text-gray-600 dark:text-gray-400 mt-1">{hint}</p>
                </div>
                {status !== 'unsupported' && status !== 'error' && (
                    <span className="inline-flex items-center gap-2 flex-shrink-0">
                        {push.busy && <Loader2 className="w-4 h-4 animate-spin text-orange-500" aria-hidden="true" />}
                        <ToggleSwitch
                            label="Push notifications for your account"
                            checked={status === 'on'}
                            disabled={status === 'denied' || push.busy}
                            onChange={(next) => { void (next ? push.enable('settings') : push.disable()); }}
                        />
                    </span>
                )}
            </div>
            {status === 'error' && (
                <button type="button" onClick={push.retry} className="mt-3 px-4 py-2 bg-gray-500/10 text-gray-900 dark:text-white rounded-xl text-sm font-medium hover:bg-gray-500/20 transition-colors">
                    Try again
                </button>
            )}
            {status === 'on' && (
                <p className="text-xs text-gray-500 mt-3">This switch covers your whole account. Turning it off here stops push on all your devices, and you can turn it on again from any of them.</p>
            )}
            {push.error && <p role="alert" className="text-sm text-red-400 mt-3">{push.error}</p>}
        </section>
    );
}
