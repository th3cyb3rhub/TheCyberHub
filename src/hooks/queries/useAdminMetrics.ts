import { useQuery } from '@tanstack/react-query';
import { getActivation } from '@/lib/api/adminMetrics';
import type { ActivationResponse } from '@/types/adminMetrics';

/** Weekly activation funnel; only ask when the viewer is allowed to see it */
export function useActivationFunnel(weeks: number, enabled = true) {
    return useQuery<ActivationResponse, Error>({
        queryKey: ['admin', 'metrics', 'activation', weeks],
        queryFn: () => getActivation(weeks),
        enabled,
        staleTime: 5 * 60_000,
    });
}
