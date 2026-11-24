import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api/events';
import { saveBlob } from '@/lib/events/download';
import { calendarFeedErrorMessage, eventErrorMessage, exportErrorMessage } from '@/lib/events/errors';
import type { ArchiveFilters, ArchivePage, AttendanceUndoResult, CalendarTokenCreated, EventCategory } from '@/types/event';
import { eventKeys } from './useEvents';

/**
 * One range of the public calendar. The call carries no token, so the answer is the same for every
 * visitor and the key has no member in it.
 */
export function useEventsCalendar(range: { from: string; to: string } | null, category: EventCategory | '' = '') {
    return useQuery({
        queryKey: eventKeys.calendar(range ?? { from: '', to: '' }, category),
        queryFn: () => api.getCalendar({ from: range!.from, to: range!.to, category }),
        enabled: !!range,
        staleTime: 60_000,
        // Moving to another month keeps the grid on screen (dimmed) so keyboard focus stays where it is
        placeholderData: keepPreviousData,
        retry: (count, err) => (err as { status?: number })?.status !== 400 && count < 2,
    });
}

const ARCHIVE_PAGE = 12;

/** Past events, newest first, with "load more" (the API sends `hasMore`, not a total) */
export function useEventArchives(filters: ArchiveFilters, { enabled = true }: { enabled?: boolean } = {}) {
    const base = { limit: ARCHIVE_PAGE, ...filters };
    return useInfiniteQuery({
        queryKey: eventKeys.archives(base),
        queryFn: ({ pageParam }) => api.listArchives({ ...base, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: (last: ArchivePage) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined),
        enabled,
        staleTime: 60_000,
        placeholderData: keepPreviousData,
    });
}

// ---------------------------------------------------------------------------
// The member's private feed
// ---------------------------------------------------------------------------

/** Whether a feed exists, when it was made and last read. Never the address. */
export function useCalendarToken(enabled = true) {
    const { user } = useAuth();
    const qc = useQueryClient();
    // After a sign out nothing about the member's feed stays in memory
    useEffect(() => {
        if (!user) qc.removeQueries({ queryKey: ['events', 'calendar-token'] });
    }, [user, qc]);
    return useQuery({
        queryKey: eventKeys.calendarToken(user?.id ?? null),
        queryFn: api.getCalendarTokenStatus,
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

/**
 * Create or replace the feed address. The address is a secret that exists only in the answer of this
 * call, so it is not a query or a mutation (both would keep the result in the cache for minutes):
 * `create` hands it to the caller, who keeps it in component state while the dialog is open and drops it
 * on close. Nothing here stores or logs it.
 */
export function useCreateCalendarToken() {
    const qc = useQueryClient();
    const { user } = useAuth();
    const { addToast } = useToast();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const create = useCallback(async (): Promise<CalendarTokenCreated | null> => {
        setPending(true);
        setError(null);
        try {
            const created = await api.createCalendarToken();
            // Only the facts that are not secret go to the cache
            qc.setQueryData(eventKeys.calendarToken(user?.id ?? null), {
                active: true, createdAt: created.createdAt, rotatedAt: created.rotated ? new Date().toISOString() : null, lastUsedAt: null,
            });
            void qc.invalidateQueries({ queryKey: eventKeys.calendarToken(user?.id ?? null) });
            return created;
        } catch (err) {
            const message = calendarFeedErrorMessage(err);
            setError(message);
            addToast({ variant: 'error', message });
            return null;
        } finally {
            setPending(false);
        }
    }, [qc, user?.id, addToast]);

    return { create, isPending: pending, error, clearError: () => setError(null) };
}

export function useRevokeCalendarToken() {
    const qc = useQueryClient();
    const { user } = useAuth();
    const { addToast } = useToast();
    return useMutation({
        mutationFn: api.revokeCalendarToken,
        retry: 0,
        onSuccess: () => {
            qc.setQueryData(eventKeys.calendarToken(user?.id ?? null), { active: false, createdAt: null, rotatedAt: null, lastUsedAt: null });
            addToast({ variant: 'success', message: 'Your calendar feed was turned off. The old address no longer works.' });
            void qc.invalidateQueries({ queryKey: eventKeys.calendarToken(user?.id ?? null) });
        },
        onError: (err) => addToast({ variant: 'error', message: calendarFeedErrorMessage(err) }),
    });
}

// ---------------------------------------------------------------------------
// Organizer tools
// ---------------------------------------------------------------------------

export interface ExportSummary { filename: string; rows: number; truncated: boolean }

/**
 * Fetch the attendee list with the member's token and save it as a file. Only the summary is kept: the
 * list holds names, so it is not left in the mutation cache.
 */
export async function downloadAttendeesCsv(id: string, slug: string): Promise<ExportSummary> {
    const file = await api.exportAttendees(id, slug);
    saveBlob(file.blob, file.filename);
    return { filename: file.filename, rows: file.rows, truncated: file.truncated };
}

export function useExportAttendees() {
    const { addToast } = useToast();
    return useMutation<ExportSummary, unknown, { id: string; slug: string }>({
        mutationFn: (v) => downloadAttendeesCsv(v.id, v.slug),
        retry: 0,
        onSuccess: (result) => {
            addToast({
                variant: result.truncated ? 'info' : 'success',
                message: result.truncated
                    ? `Saved ${result.filename} with the first ${result.rows} rows. The list is longer than the export limit.`
                    : `Saved ${result.filename} (${result.rows} ${result.rows === 1 ? 'row' : 'rows'}).`,
            });
        },
        onError: (err) => addToast({ variant: 'error', message: exportErrorMessage(err) }),
    });
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What an undo did, in a sentence */
export function undoSummary(result: AttendanceUndoResult): string {
    const parts: string[] = [];
    parts.push(result.undone.length ? `${plural(result.undone.length, 'attendance')} undone` : 'Nothing was undone');
    if (result.pointsReversed > 0) parts.push(`${plural(result.pointsReversed, 'point')} taken back`);
    if (result.notAttended.length) parts.push(`${result.notAttended.length} ${result.notAttended.length === 1 ? 'was' : 'were'} not marked as attended`);
    if (result.notRegistered.length) parts.push(`${result.notRegistered.length} ${result.notRegistered.length === 1 ? 'is' : 'are'} not registered`);
    return `${parts.join(', ')}.`;
}

export function useUndoAttendance() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation({
        mutationFn: (v: { id: string; userIds: string[] }) => api.undoAttendance(v.id, v.userIds),
        retry: 0,
        onSuccess: (result) => {
            addToast({ variant: result.undone.length ? 'success' : 'info', message: undoSummary(result) });
            void qc.invalidateQueries({ queryKey: ['events', 'attendees'] });
            void qc.invalidateQueries({ queryKey: eventKeys.details() });
        },
        onError: (err) => addToast({ variant: 'error', message: eventErrorMessage(err) }),
    });
}
