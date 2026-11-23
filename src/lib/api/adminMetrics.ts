import { fetchApi } from '@/lib/api';
import type { ActivationResponse } from '@/types/adminMetrics';

export const ACTIVATION_WEEK_CHOICES = [4, 8, 12, 26] as const;

export async function getActivation(weeks: number): Promise<ActivationResponse> {
    const res = await fetchApi(`/api/admin/metrics/activation?weeks=${encodeURIComponent(String(weeks))}`);
    return { weeks: Array.isArray(res?.data?.weeks) ? res.data.weeks : [] };
}
