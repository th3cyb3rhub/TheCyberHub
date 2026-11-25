'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { listSessions, revokeOtherSessions, revokeSession } from '@/lib/api/sessions';
import { queryKeys } from '@/lib/queryClient';
import { tokenUserId } from '@/lib/tokenStore';

/** The signed-in account's open sessions. Read again when the tab is used again, so a device ended elsewhere disappears. */
export function useSessions() {
    const { token, user } = useAuth();
    return useQuery({
        queryKey: queryKeys.auth.sessions(tokenUserId(token)),
        queryFn: listSessions,
        enabled: !!user,
        staleTime: 0,
        refetchOnWindowFocus: true,
        retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500),
    });
}

export function useSessionActions() {
    const queryClient = useQueryClient();
    const { token } = useAuth();
    const key = queryKeys.auth.sessions(tokenUserId(token));
    const refresh = () => queryClient.invalidateQueries({ queryKey: key });

    const revokeOne = useMutation({
        mutationFn: async (id: string) => {
            try {
                await revokeSession(id);
            } catch (err) {
                // Already over: the list is what is wrong, not the request
                if (!(err instanceof ApiError && err.status === 404)) throw err;
            }
        },
        retry: false,
        onSettled: refresh,
    });

    const revokeOthers = useMutation({
        mutationFn: revokeOtherSessions,
        retry: false,
        onSettled: refresh,
    });

    return { revokeOne, revokeOthers };
}
