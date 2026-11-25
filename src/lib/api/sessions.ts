import { fetchApi } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants/api-endpoints';
import type { AccountSession } from '@/types/auth';

const E = API_ENDPOINTS.AUTH;

/** The account's open sessions, the current one first */
export async function listSessions(): Promise<AccountSession[]> {
    const res = await fetchApi(E.SESSIONS);
    return Array.isArray(res?.data) ? res.data : [];
}

/** Ends one session. A session that is already over answers 404, which callers treat as done. */
export async function revokeSession(id: string): Promise<void> {
    await fetchApi(E.SESSION(id), { method: 'DELETE' });
}

/** Ends every session except the one making the call. Resolves with how many ended. */
export async function revokeOtherSessions(): Promise<number> {
    const res = await fetchApi(E.SESSIONS_OTHERS, { method: 'DELETE' });
    return typeof res?.data?.revoked === 'number' ? res.data.revoked : 0;
}
