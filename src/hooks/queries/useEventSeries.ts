import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api/events';
import { eventErrorMessage } from '@/lib/events/errors';
import type { Series } from '@/types/event';
import { eventKeys } from './useEvents';

/**
 * A series. Public, but the creator and administrators get more fields when the token is sent, so the
 * answer depends on the viewer and the key has the member in it. Data rendered on the server (without
 * a login) is treated as stale, so a signed-in visitor always asks again.
 */
export function useEventSeries(id: string, initialData?: Series | null) {
    const { user, loading } = useAuth();
    return useQuery({
        queryKey: eventKeys.series(id, user?.id ?? null),
        queryFn: () => api.getSeries(id),
        enabled: !!id && !loading,
        initialData: initialData ?? undefined,
        initialDataUpdatedAt: 0,
        staleTime: 30_000,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

/** Series changes touch events, the calendar and the archive, so everything under `events` refreshes */
function useSeriesMutation<V, R>(run: (v: V) => Promise<R>, success: (result: R) => string, seriesOf?: (result: R) => Series | undefined, idOf?: (v: V) => string) {
    const qc = useQueryClient();
    const { user } = useAuth();
    const { addToast } = useToast();
    return useMutation<R, unknown, V>({
        mutationFn: run,
        retry: 0,
        onSuccess: (result, v) => {
            const series = seriesOf?.(result);
            const id = idOf?.(v);
            if (series && id) qc.setQueryData(eventKeys.series(id, user?.id ?? null), series);
            addToast({ variant: 'success', message: success(result) });
            void qc.invalidateQueries({ queryKey: eventKeys.all });
        },
        onError: (err) => addToast({ variant: 'error', message: eventErrorMessage(err) }),
    });
}

/** The form shows its own errors under the fields, so this one only refreshes the lists */
export function useCreateSeries() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: Record<string, unknown>) => api.createSeries(payload),
        retry: 0,
        onSuccess: () => void qc.invalidateQueries({ queryKey: eventKeys.all }),
    });
}

/** `scope: 'this'` edits one occurrence, `scope: 'future'` the template and the occurrences that have not started */
export function usePatchSeries() {
    const qc = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: (v: { id: string; payload: Record<string, unknown> }) => api.patchSeries(v.id, v.payload),
        retry: 0,
        onSuccess: (result, v) => {
            qc.setQueryData(eventKeys.series(v.id, user?.id ?? null), result.series);
            void qc.invalidateQueries({ queryKey: eventKeys.all });
        },
    });
}

export const usePauseSeries = () => useSeriesMutation(
    (v: { id: string }) => api.pauseSeries(v.id),
    () => 'The series is paused. Nothing new is created until you resume it.',
    (s) => s, (v) => v.id,
);

export const useResumeSeries = () => useSeriesMutation(
    (v: { id: string }) => api.resumeSeries(v.id),
    () => 'The series is running again.',
    (s) => s, (v) => v.id,
);

export const useEndSeries = () => useSeriesMutation(
    (v: { id: string; reason?: string }) => api.endSeries(v.id, v.reason),
    (r) => {
        const parts = ['The series has ended.'];
        if (r.cancelled) parts.push(`${r.cancelled} upcoming ${r.cancelled === 1 ? 'occurrence was' : 'occurrences were'} cancelled and the registered members told.`);
        if (r.removed) parts.push(`${r.removed} with no registrations ${r.removed === 1 ? 'was' : 'were'} removed.`);
        return parts.join(' ');
    },
    (s) => s, (v) => v.id,
);
