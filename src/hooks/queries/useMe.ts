'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError, fetchApi } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants/api-endpoints';
import { queryKeys, staleTimes } from '@/lib/queryClient';
import { tokenUserId } from '@/lib/tokenStore';
import type { AuthUser } from '@/types/auth';

/** The cache key of the account that holds `token`. */
export const meKey = (token: string | null) => queryKeys.auth.me(tokenUserId(token));

/**
 * The signed-in account, read from `/auth/me`. Off while there is no access token. A 4xx answer is
 * final (the request layer has already renewed or ended the session); a network or server failure
 * is tried once more.
 */
export function useMe(token: string | null) {
    return useQuery({
        queryKey: meKey(token),
        queryFn: async (): Promise<AuthUser> => (await fetchApi(API_ENDPOINTS.AUTH.ME)).data,
        enabled: !!token,
        staleTime: staleTimes.user,
        // A revoked session is noticed when the tab is used again
        refetchOnWindowFocus: true,
        retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500),
        retryDelay: 800,
    });
}
