'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Globe, Loader2, LogOut, Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSessionActions, useSessions } from '@/hooks/queries/useSessions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FullPageSpinner, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { btnDanger, btnSecondary, card, heading, muted } from '@/components/events/styles';
import { authErrorMessage } from '@/lib/authErrors';
import { describeDevice, timeAgo } from '@/lib/userAgent';
import type { AccountSession } from '@/types/auth';

type Notice = { tone: 'ok' | 'error'; text: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const startedOn = (iso: string) => {
    const date = new Date(iso);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'unknown';
};

function SessionRow({ session, busy, disabled, onRevoke }: { session: AccountSession; busy: boolean; disabled: boolean; onRevoke: () => void }) {
    const device = describeDevice(session.userAgent);
    const Icon = device.mobile ? Smartphone : Monitor;
    const where = session.ipAddress || 'Unknown address';
    return (
        <li className={`${card} flex flex-wrap items-center gap-4 p-4`} data-testid="session-row" aria-current={session.current ? 'true' : undefined}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300">
                <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 basis-56">
                <p className={`flex flex-wrap items-center gap-2 font-medium ${heading}`}>
                    <span>{device.label}</span>
                    {session.current && (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-900 dark:bg-green-500/20 dark:text-green-300">Current session</span>
                    )}
                </p>
                <p className={`break-words text-sm ${muted}`}>
                    {where} <span aria-hidden="true">&middot;</span> Last active{' '}
                    <time dateTime={session.lastUsedAt} title={Number.isNaN(Date.parse(session.lastUsedAt)) ? undefined : new Date(session.lastUsedAt).toLocaleString()}>{timeAgo(session.lastUsedAt)}</time>
                </p>
                <p className={`text-xs ${muted}`}>Signed in {startedOn(session.createdAt)}</p>
            </div>
            {!session.current && (
                <button
                    type="button"
                    onClick={onRevoke}
                    disabled={disabled}
                    aria-label={`Sign out ${device.label}, ${where}`}
                    className={`${btnSecondary} max-sm:w-full`}
                >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
                    Sign out
                </button>
            )}
        </li>
    );
}

function SessionsSkeleton() {
    return (
        <ul className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
                <li key={i} className={`${card} flex items-center gap-4 p-4`}>
                    <div className="h-10 w-10 animate-pulse rounded-lg bg-gray-200 dark:bg-white/10" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-40 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                        <div className="h-3 w-56 max-w-full animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** The devices signed in to this account: which one this is, when each was last used, and how to end them. */
export function SessionsView() {
    const router = useRouter();
    const { logout } = useAuth();
    const { ready } = useRequireLogin('/profile/sessions');
    const sessions = useSessions();
    const { revokeOne, revokeOthers } = useSessionActions();
    const [notice, setNotice] = useState<Notice | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [confirmAll, setConfirmAll] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const listHeading = useRef<HTMLHeadingElement>(null);

    if (!ready) return <FullPageSpinner label="Loading sessions" />;

    const list = sessions.data ?? [];
    const others = list.filter((s) => !s.current);
    const working = revokeOne.isPending || revokeOthers.isPending || leaving;
    // The list has settled: put keyboard focus somewhere that still exists once a row is gone
    const settle = () => listHeading.current?.focus();

    const signOutOne = (session: AccountSession) => {
        const label = describeDevice(session.userAgent).label;
        setNotice(null);
        setRevokingId(session.id);
        revokeOne.mutate(session.id, {
            onSuccess: () => { setNotice({ tone: 'ok', text: `Signed out ${label}.` }); settle(); },
            onError: (err) => setNotice({ tone: 'error', text: authErrorMessage(err, `Could not sign out ${label}. Please try again.`) }),
            onSettled: () => setRevokingId(null),
        });
    };

    const signOutOthers = () => {
        setNotice(null);
        revokeOthers.mutate(undefined, {
            onSuccess: (count) => {
                setNotice({ tone: 'ok', text: count > 0 ? `Signed out ${plural(count, 'other session', 'other sessions')}.` : 'There were no other sessions to sign out.' });
                settle();
            },
            onError: (err) => setNotice({ tone: 'error', text: authErrorMessage(err, 'Could not sign out your other sessions. Please try again.') }),
        });
    };

    const signOutEverywhere = async () => {
        setConfirmAll(false);
        setNotice(null);
        setLeaving(true);
        try {
            await logout({ allDevices: true });
            router.replace('/auth');
        } catch (err) {
            setLeaving(false);
            setNotice({ tone: 'error', text: authErrorMessage(err, 'Could not sign out of all devices. Please try again.') });
        }
    };

    return (
        <PageShell title="Active sessions" subtitle="Devices where you are signed in. Sign out any you do not recognise." backHref="/profile?tab=security" backLabel="Back to security settings">
            <div className="mb-6 flex flex-wrap gap-3">
                <button type="button" onClick={signOutOthers} disabled={working || others.length === 0} className={`${btnSecondary} max-sm:w-full`}>
                    {revokeOthers.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
                    Sign out other sessions
                </button>
                <button type="button" onClick={() => setConfirmAll(true)} disabled={working} className={`${btnDanger} max-sm:w-full`}>
                    {leaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
                    Sign out everywhere
                </button>
            </div>

            <div role="status" aria-live="polite" className="empty:hidden">
                {notice?.tone === 'ok' && (
                    <p className="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-100">{notice.text}</p>
                )}
            </div>
            {notice?.tone === 'error' && (
                <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {notice.text}
                </p>
            )}

            <h2 ref={listHeading} tabIndex={-1} className={`mb-3 text-sm font-semibold uppercase tracking-wide outline-none ${muted}`}>
                Signed-in devices{sessions.isSuccess ? ` (${list.length})` : ''}
            </h2>

            {sessions.isPending && <div aria-busy="true" aria-label="Loading sessions"><SessionsSkeleton /></div>}

            {sessions.isError && (
                <div role="alert" className={`${card} p-6 text-center`}>
                    <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-700 dark:text-red-400" aria-hidden="true" />
                    <p className={`mb-4 text-sm ${muted}`}>{authErrorMessage(sessions.error, 'Could not load your sessions.')}</p>
                    <button type="button" onClick={() => sessions.refetch()} className={btnSecondary}>
                        <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
                    </button>
                </div>
            )}

            {sessions.isSuccess && list.length === 0 && (
                <div className={`${card} p-8 text-center`}>
                    <Globe className="mx-auto mb-3 h-10 w-10 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <p className={`font-medium ${heading}`}>No active sessions found</p>
                    <p className={`mt-1 text-sm ${muted}`}>If you signed in a long time ago, sign out and back in to see this device here.</p>
                </div>
            )}

            {sessions.isSuccess && list.length > 0 && (
                <ul className="space-y-3">
                    {list.map((session) => (
                        <SessionRow
                            key={session.id}
                            session={session}
                            busy={revokingId === session.id}
                            disabled={working}
                            onRevoke={() => signOutOne(session)}
                        />
                    ))}
                </ul>
            )}

            <p className={`mt-6 text-xs ${muted}`}>An account can be signed in on up to 25 devices. When it goes over, the device unused the longest is signed out.</p>

            <ConfirmDialog
                open={confirmAll}
                title="Sign out everywhere?"
                description="This signs you out on every device, this one included. You will need to sign in again."
                confirmText="Sign out everywhere"
                onConfirm={signOutEverywhere}
                onCancel={() => setConfirmAll(false)}
            />
        </PageShell>
    );
}
