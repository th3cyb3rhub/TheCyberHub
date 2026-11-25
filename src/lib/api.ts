import { API_URL } from '@/lib/apiBase';
import { AUTH_CODES, sessionEndReason } from '@/lib/authErrors';
import { refreshAccessToken } from '@/lib/authRefresh';
import { endSession } from '@/lib/authSession';
import { tokenStore, tokenUserId } from '@/lib/tokenStore';

export { API_URL, tokenStore };

interface FetchOptions extends RequestInit {
    requireAuth?: boolean;
    /**
     * Return the Response itself instead of the parsed JSON, for files. Authentication, the one
     * token refresh and the error mapping are the same.
     */
    raw?: boolean;
}

/** A failed API call. `code` is the machine-readable error code the API sends, when there is one. */
export class ApiError extends Error {
    status: number;
    code?: string;
    /** Field level problems of a 400 VALIDATION_ERROR: `[{ field: 'startDate', message: '...' }]` */
    details?: ApiErrorDetail[];
    /** Machine-readable context some errors carry (`reason`, `scope`, `retryAfter` on the tools API) */
    meta?: Record<string, unknown>;
    /** The API's own clock when it built the error (`timestamp` of the error body), an ISO instant */
    serverTime?: string;
    constructor(message: string, status: number, code?: string, details?: ApiErrorDetail[], meta?: Record<string, unknown>) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details;
        this.meta = meta;
    }
}

export interface ApiErrorDetail {
    field?: string;
    message: string;
}

/** A failed response as an `ApiError`: the API's message, code, field details and the wait of a rate limit. */
async function failureOf(response: Response): Promise<ApiError> {
    let errorMessage = 'An error occurred while fetching data';
    let errorCode: string | undefined;
    let errorDetails: ApiErrorDetail[] | undefined;
    let errorMeta: Record<string, unknown> | undefined;
    let errorTime: string | undefined;
    try {
        const data = await response.json();
        errorMessage = data.message || data.error?.message || errorMessage;
        if (typeof data.timestamp === 'string') errorTime = data.timestamp;
        if (typeof data.error?.code === 'string') errorCode = data.error.code;
        // Rate limiters answer with the wait at `error.retryAfter` (seconds); a lock puts it in `meta`.
        // Either way callers read `meta.retryAfter`.
        const waited = Number(data.error?.retryAfter);
        if (Number.isFinite(waited) && waited > 0 && !(typeof data.error?.meta?.retryAfter === 'number')) {
            const own = data.error?.meta;
            errorMeta = { ...(own && typeof own === 'object' && !Array.isArray(own) ? own : {}), retryAfter: waited };
        }
        if (!errorMeta && data.error?.meta && typeof data.error.meta === 'object' && !Array.isArray(data.error.meta)) {
            errorMeta = data.error.meta;
        }
        if (Array.isArray(data.error?.details)) {
            errorDetails = data.error.details
                .filter((d: unknown): d is { field?: unknown; message: string } => !!d && typeof (d as { message?: unknown }).message === 'string')
                .map((d: { field?: unknown; message: string }) => ({
                    field: typeof d.field === 'string' ? d.field : undefined,
                    message: d.message,
                }));
        }
    } catch {
        // Ignore JSON parsing errors
    }
    // A 429 also carries the wait in the `Retry-After` header (seconds); the body's own value wins
    const headerWait = Number(response.headers?.get?.('Retry-After'));
    if (Number.isFinite(headerWait) && headerWait > 0 && typeof errorMeta?.retryAfter !== 'number') {
        errorMeta = { ...(errorMeta ?? {}), retryAfter: headerWait };
    }
    const failure = new ApiError(errorMessage, response.status, errorCode, errorDetails, errorMeta);
    if (errorTime) failure.serverTime = errorTime;
    return failure;
}

/**
 * A wrapper around the native Web API fetch function that attaches the access token, maps failures to
 * `ApiError`, and keeps the sign-in alive.
 *
 * Only a 401 with code `AUTH_TOKEN_INVALID` on a call that carried the access token means "renew it":
 * the token is refreshed (one refresh at a time for the whole page) and the request is sent once more.
 * A 401 from a call without the token (sign-in, the second factor) is just an error, and so is any
 * other 401 without that code. A session the API says is over (`AUTH_SESSION_REVOKED`,
 * `AUTH_LEGACY_TOKEN_REFUSED`, a disabled account) signs this browser out. Calls under `/api/auth/`
 * send the cookie that holds the refresh token.
 */
export async function fetchApi(endpoint: string, options: FetchOptions = {}) {
    const { requireAuth = true, raw = false, headers = {}, ...restOptions } = options;

    const buildHeaders = (): Record<string, string> => {
        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(headers as Record<string, string>),
        };
        if (requireAuth) {
            const token = tokenStore.get();
            if (token) {
                requestHeaders['Authorization'] = `Bearer ${token}`;
            }
        }
        return requestHeaders;
    };

    const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
    const send = async () => {
        const requestHeaders = buildHeaders();
        const response = await fetch(url, {
            ...(endpoint.startsWith('/api/auth/') ? { credentials: 'include' as const } : {}),
            headers: requestHeaders,
            ...restOptions,
        });
        return { response, bearer: requestHeaders['Authorization'] as string | undefined };
    };

    let { response, bearer } = await send();
    let failure = response.ok ? null : await failureOf(response);

    if (failure?.status === 401 && failure.code === AUTH_CODES.TOKEN_INVALID && requireAuth && bearer) {
        const stale = bearer.replace(/^Bearer /, '');
        const outcome = await refreshAccessToken(stale);
        if (outcome === 'refreshed') {
            // Another account may have signed in here while this call waited: its token must not carry this call
            const staleId = tokenUserId(stale);
            const freshId = tokenUserId(tokenStore.get());
            if (staleId && freshId && staleId !== freshId) throw failure;
            ({ response, bearer } = await send());
            failure = response.ok ? null : await failureOf(response);
        }
    }

    if (failure) {
        const reason = bearer ? sessionEndReason(failure.status, failure.code) : null;
        // Only the session this call was sent with: a newer sign-in is not ended by an old answer
        if (reason) endSession(reason, bearer!.replace(/^Bearer /, ''));
        throw failure;
    }

    if (raw) return response;

    try {
        if (response.status !== 204) {
            return await response.json();
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Uploads a file to the S3 bucket via the backend /api/upload/media endpoint.
 * @param file The File object to upload
 * @param folder The destination folder in S3 (e.g. 'feed', 'blogs', 'mentorship')
 * @returns The S3 URL of the uploaded media
 */
export async function uploadFile(file: File, folder: string = 'misc'): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const token = tokenStore.get();

    const response = await fetch(`${API_URL}/api/upload/media`, {
        method: 'POST',
        headers: {
            // Do NOT set Content-Type to application/json or multipart/form-data here
            // Let the browser set it automatically with the correct boundary for FormData
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData,
    });

    if (!response.ok) {
        let errorMessage = 'Failed to upload file';
        try {
            const data = await response.json();
            errorMessage = data.message || data.error?.message || errorMessage;
        } catch { /* response body isn't JSON — use default message */ }
        throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.data.url;
}

/**
 * Deletes a file from the S3 bucket using its URL.
 * @param url The S3 URL to delete
 */
export async function deleteFile(url: string): Promise<void> {
    if (!url) return;

    await fetchApi('/api/upload/media', {
        method: 'DELETE',
        body: JSON.stringify({ url }),
    });
}

