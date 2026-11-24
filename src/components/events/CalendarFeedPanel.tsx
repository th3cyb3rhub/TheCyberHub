'use client';

import { useState } from 'react';
import { CalendarSync, Loader2, RefreshCw, Rss, ShieldAlert, Trash2 } from 'lucide-react';
import { useCalendarToken, useCreateCalendarToken, useRevokeCalendarToken } from '@/hooks/queries/useEventCalendar';
import { useViewerZone } from '@/lib/events/clock';
import { calendarFeedErrorMessage } from '@/lib/events/errors';
import { formatClock, formatDayYear } from '@/lib/events/time';
import type { CalendarTokenCreated } from '@/types/event';
import { CopyField } from './CopyField';
import { DialogShell } from './DialogShell';
import { EventDialog } from './EventDialog';
import { btnPrimary, btnSecondary, cardPad, muted } from './styles';

/**
 * The member's private calendar feed. The address holds a secret, so it is shown once, in a dialog,
 * from component state; closing the dialog drops it and the page only ever knows when the feed was
 * made and last used.
 */
export function CalendarFeedPanel() {
    const status = useCalendarToken();
    const { create, isPending: creating } = useCreateCalendarToken();
    const revoke = useRevokeCalendarToken();
    const zone = useViewerZone() ?? 'UTC';
    // The only copy of the address in the app. Cleared when the dialog closes.
    const [secret, setSecret] = useState<CalendarTokenCreated | null>(null);
    const [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null);
    const [confirmError, setConfirmError] = useState<string | null>(null);

    const when = (iso: string | null | undefined) => (iso ? `${formatDayYear(iso, zone)} at ${formatClock(iso, zone)}` : null);
    const active = !!status.data?.active;

    const makeFeed = async () => {
        const created = await create();
        if (created) {
            setConfirm(null);
            setSecret(created);
        }
        return created;
    };

    return (
        <section aria-labelledby="feed-heading" className={cardPad} data-testid="feed-panel">
            <h2 id="feed-heading" className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                <CalendarSync className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> My calendar feed
            </h2>
            <p className={`mb-4 text-sm ${muted}`}>
                Add the events you registered for, or are waiting on, to your own calendar app. It updates by itself when an event moves or is cancelled.
            </p>

            {status.isLoading ? (
                <div className="h-10 animate-pulse rounded-xl bg-gray-200 dark:bg-neutral-800" role="status" aria-label="Loading your calendar feed" />
            ) : status.isError ? (
                <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700 dark:text-red-400">
                    <span>{calendarFeedErrorMessage(status.error)}</span>
                    <button type="button" className="font-medium underline" onClick={() => void status.refetch()}>Try again</button>
                </div>
            ) : active ? (
                <div className="space-y-4">
                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                        <div><dt className={muted}>Created</dt><dd className="font-medium text-gray-900 dark:text-white" data-testid="feed-created">{when(status.data?.rotatedAt ?? status.data?.createdAt) ?? 'Unknown'}</dd></div>
                        <div><dt className={muted}>Last used by a calendar app</dt><dd className="font-medium text-gray-900 dark:text-white" data-testid="feed-last-used">{when(status.data?.lastUsedAt) ?? 'Not used yet'}</dd></div>
                    </dl>
                    <p className={`text-xs ${muted}`}>For safety the address is not shown again. If you lost it, replace it with a new one.</p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={btnSecondary} onClick={() => { setConfirmError(null); setConfirm('rotate'); }}>
                            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Replace the address
                        </button>
                        <button type="button" className={`${btnSecondary} text-red-800 dark:text-red-300`} onClick={() => { setConfirmError(null); setConfirm('revoke'); }}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" /> Turn off the feed
                        </button>
                    </div>
                </div>
            ) : (
                <button type="button" className={btnPrimary} disabled={creating} onClick={() => void makeFeed()}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Rss className="h-4 w-4" aria-hidden="true" />} Create my feed
                </button>
            )}

            <DialogShell
                open={!!secret}
                onOpenChange={(open) => { if (!open) setSecret(null); }}
                title={secret?.rotated ? 'Your new calendar address' : 'Your calendar address'}
                description="Copy it into your calendar app now. It is shown only this once."
                wide
                footer={<button type="button" className={btnPrimary} onClick={() => setSecret(null)}>I have copied it</button>}
            >
                {secret && (
                    <div className="space-y-4">
                        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>Anyone who has this link can see the events you registered for. Do not share it or post it. If it leaks, replace it and the old link stops working.</span>
                        </div>
                        <CopyField id="feed-url" label="Calendar address (Google Calendar: add by URL)" value={secret.url} sensitive />
                        <CopyField id="feed-webcal" label="Calendar link (Apple Calendar, Outlook)" value={secret.webcalUrl} sensitive />
                    </div>
                )}
            </DialogShell>

            <EventDialog
                open={confirm === 'rotate'}
                onOpenChange={(open) => !open && setConfirm(null)}
                title="Replace your calendar address?"
                description="The current address stops working at once. Calendar apps that use it stop updating until you add the new one."
                confirmLabel="Replace the address"
                destructive
                pending={creating}
                error={confirmError}
                onConfirm={() => void makeFeed().then((created) => { if (!created) setConfirmError('Could not replace the address. Please try again.'); })}
            />
            <EventDialog
                open={confirm === 'revoke'}
                onOpenChange={(open) => !open && setConfirm(null)}
                title="Turn off your calendar feed?"
                description="The address stops working at once and calendar apps stop updating. You can create a new feed later."
                confirmLabel="Turn off the feed"
                destructive
                pending={revoke.isPending}
                error={confirmError}
                onConfirm={() => revoke.mutate(undefined, {
                    onSuccess: () => setConfirm(null),
                    onError: (err) => setConfirmError(calendarFeedErrorMessage(err)),
                })}
            />
        </section>
    );
}
