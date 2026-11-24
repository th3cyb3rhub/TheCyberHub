'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAdminRole } from '@/lib/events/roles';
import { isSeriesId } from '@/lib/events/series';
import { isModeratorRole } from '@/lib/roles';
import { SeriesForm } from './SeriesForm';
import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from './PageShell';
import { btnSecondary, cardPad, input, label as labelClass, muted } from './styles';

/** Staff: create a recurring series, or open one by its id to manage it (events of a series link to it as well) */
export function AdminSeriesView() {
    const { user, ready } = useRequireLogin('/admin/events/series');
    const router = useRouter();
    const [id, setId] = useState('');
    const [error, setError] = useState<string | null>(null);

    if (!ready || !user) return <FullPageSpinner />;
    if (!isModeratorRole(user.role)) return <NoAccess message="Only moderators and administrators can manage recurring series." href="/events" />;

    const open = (e: React.FormEvent) => {
        e.preventDefault();
        const value = id.trim();
        if (!isSeriesId(value)) {
            setError('A series id has 24 letters and digits. Open it from the series link on any of its events.');
            return;
        }
        router.push(`/events/series/${value}`);
    };

    return (
        <PageShell title="Recurring series" subtitle="A schedule that creates ordinary events: registration, reminders and the calendar work on each date." backHref="/admin/events" backLabel="Event review">
            <section className={`${cardPad} mb-8`} aria-labelledby="open-heading">
                <h2 id="open-heading" className="mb-1 text-base font-semibold text-gray-900 dark:text-white">Manage a series you already have</h2>
                <p className={`mb-3 text-sm ${muted}`}>Every event of a series has a Series link. Or paste the id of a series.</p>
                <form onSubmit={open} noValidate className="flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1 basis-64">
                        <label htmlFor="series-id" className={labelClass}>Series id</label>
                        <input id="series-id" value={id} onChange={(e) => { setId(e.target.value); setError(null); }} className={`${input} font-mono`} aria-invalid={!!error || undefined} aria-describedby={error ? 'series-id-error' : undefined} autoComplete="off" spellCheck={false} />
                    </div>
                    <button type="submit" className={btnSecondary}>Open</button>
                </form>
                {error && <p id="series-id-error" role="alert" className="mt-2 text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
            </section>
            <SeriesForm admin={isAdminRole(user.role)} />
        </PageShell>
    );
}
