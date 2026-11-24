export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

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

// Centralized token access — all token reads/writes go through here
export const tokenStore = {
    get: (): string | null => {
        if (typeof window === 'undefined') return null;
        try { return window.localStorage.getItem('token'); } catch { return null; }
    },
    set: (token: string): void => {
        if (typeof window === 'undefined') return;
        try { window.localStorage.setItem('token', token); } catch { /* quota/private */ }
    },
    remove: (): void => {
        if (typeof window === 'undefined') return;
        try { window.localStorage.removeItem('token'); } catch { /* ignore */ }
    },
};

/**
 * A wrapper around the native Web API fetch function that automatically handles
 * attaching the Authentication token if present, provides consistent error handling,
 * and attempts a single token refresh on 401 responses.
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

    let response = await fetch(url, {
        headers: buildHeaders(),
        ...restOptions,
    });

    // Attempt token refresh on 401 (only once, only if auth was required)
    if (response.status === 401 && requireAuth) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
            response = await fetch(url, {
                headers: buildHeaders(),
                ...restOptions,
            });
        }
    }

    if (!response.ok) {
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

// Token refresh — called automatically on 401, prevents concurrent refresh attempts
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        try {
            if (typeof window === 'undefined') return false;

            // The refresh token lives in an httpOnly cookie the browser sends with
            // `credentials: 'include'`. A token kept in localStorage by older sessions
            // is still sent in the body as a fallback.
            let legacyRefreshToken: string | null = null;
            try { legacyRefreshToken = window.localStorage.getItem('refreshToken'); } catch { /* ignore */ }

            const response = await fetch(`${API_URL}/api/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(legacyRefreshToken ? { refreshToken: legacyRefreshToken } : {}),
            });

            if (!response.ok) return false;

            // The backend answers { token, refreshToken, expiresIn }
            const data = await response.json();
            const accessToken: string | undefined = data.token ?? data.accessToken;
            if (accessToken) {
                tokenStore.set(accessToken);
                if (data.refreshToken && legacyRefreshToken) {
                    try { window.localStorage.setItem('refreshToken', data.refreshToken); } catch { /* ignore */ }
                }
                return true;
            }
            return false;
        } catch {
            return false;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
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

