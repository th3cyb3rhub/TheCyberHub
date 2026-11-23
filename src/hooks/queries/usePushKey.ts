import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getPushPublicKey } from '@/lib/api/push';

/** The server's push key; `null` data means push is not available, and its UI stays hidden */
export function usePushPublicKey(enabled = true) {
    const { user } = useAuth();
    return useQuery<string | null, Error>({
        queryKey: ['notifications', 'push', 'public-key'],
        queryFn: getPushPublicKey,
        enabled: enabled && !!user,
        staleTime: 60 * 60_000,
        retry: false,
    });
}
