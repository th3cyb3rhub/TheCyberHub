import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tokenStore, fetchApi, API_URL } from '../api'

describe('tokenStore', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('returns null when no token is stored', () => {
        expect(tokenStore.get()).toBeNull()
    })

    it('stores and retrieves a token', () => {
        tokenStore.set('my-token-123')
        expect(tokenStore.get()).toBe('my-token-123')
    })

    it('removes a stored token', () => {
        tokenStore.set('my-token-123')
        tokenStore.remove()
        expect(tokenStore.get()).toBeNull()
    })

    it('overwrites an existing token', () => {
        tokenStore.set('old-token')
        tokenStore.set('new-token')
        expect(tokenStore.get()).toBe('new-token')
    })

    it('handles localStorage errors gracefully on get', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('QuotaExceededError')
        })
        expect(tokenStore.get()).toBeNull()
        spy.mockRestore()
    })

    it('handles localStorage errors gracefully on set', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError')
        })
        // Should not throw
        expect(() => tokenStore.set('token')).not.toThrow()
        spy.mockRestore()
    })

    it('handles localStorage errors gracefully on remove', () => {
        const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('SecurityError')
        })
        expect(() => tokenStore.remove()).not.toThrow()
        spy.mockRestore()
    })
})

describe('fetchApi', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('sends request with auth header when token exists', async () => {
        tokenStore.set('test-token')
        const mockResponse = { success: true, data: { id: 1 } }

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockResponse),
        })

        const result = await fetchApi('/api/test')

        expect(global.fetch).toHaveBeenCalledWith(
            `${API_URL}/api/test`,
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-token',
                    'Content-Type': 'application/json',
                }),
            })
        )
        expect(result).toEqual(mockResponse)
    })

    it('sends request without auth header when requireAuth is false', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: 'public' }),
        })

        await fetchApi('/api/public', { requireAuth: false })

        const callHeaders = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers
        expect(callHeaders).not.toHaveProperty('Authorization')
    })

    it('keeps the code and the field details of a validation error', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ field: 'startDate', message: 'Start date is required' }, { nope: 1 }] } }),
        })

        await expect(fetchApi('/api/bad', { requireAuth: false })).rejects.toMatchObject({
            status: 400,
            code: 'VALIDATION_ERROR',
            details: [{ field: 'startDate', message: 'Start date is required' }],
        })
    })

    it('throws an error for non-ok responses', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Bad request' }),
        })

        await expect(fetchApi('/api/bad', { requireAuth: false })).rejects.toThrow('Bad request')
    })

    it('returns null for 204 No Content responses', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 204,
            json: () => Promise.reject(new Error('No content')),
        })

        const result = await fetchApi('/api/delete-thing', { requireAuth: false })
        expect(result).toBeNull()
    })

    it('uses full URL when endpoint starts with http', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
        })

        await fetchApi('https://external.api.com/data', { requireAuth: false })

        expect(global.fetch).toHaveBeenCalledWith(
            'https://external.api.com/data',
            expect.anything()
        )
    })

    it('renews the token on a 401 AUTH_TOKEN_INVALID and sends the request again', async () => {
        tokenStore.set('expired-token')
        localStorage.setItem('refreshToken', 'valid-refresh')

        let callCount = 0
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/auth/refresh')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        success: true,
                        token: 'new-access-token',
                        refreshToken: 'new-refresh-token',
                    }),
                })
            }
            callCount++
            if (callCount === 1) {
                return Promise.resolve({
                    ok: false,
                    status: 401,
                    json: () => Promise.resolve({ success: false, error: { code: 'AUTH_TOKEN_INVALID', message: 'Invalid or expired token' } }),
                })
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ data: 'success' }),
            })
        })

        const result = await fetchApi('/api/protected')
        expect(result).toEqual({ data: 'success' })
        expect(tokenStore.get()).toBe('new-access-token')
        // The old fallback token was sent once, and the cookie carries the session from now on
        const refreshCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((call: unknown[]) => String(call[0]).includes('/auth/refresh'))
        expect(refreshCall?.[1]).toMatchObject({ body: JSON.stringify({ refreshToken: 'valid-refresh' }) })
        expect(localStorage.getItem('refreshToken')).toBeNull()
    })

    it('refreshes with only the cookie when no refresh token is stored locally', async () => {
        tokenStore.set('expired-token')
        localStorage.removeItem('refreshToken')

        let callCount = 0
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/auth/refresh')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ success: true, token: 'cookie-access-token' }),
                })
            }
            callCount++
            if (callCount === 1) {
                return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ success: false, error: { code: 'AUTH_TOKEN_INVALID', message: 'Invalid' } }) })
            }
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: 'ok' }) })
        })

        const result = await fetchApi('/api/protected')

        expect(result).toEqual({ data: 'ok' })
        expect(tokenStore.get()).toBe('cookie-access-token')
        const refreshCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
            (call: unknown[]) => String(call[0]).includes('/auth/refresh')
        )
        expect(refreshCall?.[1]).toMatchObject({ method: 'POST', credentials: 'include', body: '{}' })
    })

    it('reads the wait of a rate limiter (error.retryAfter) into meta.retryAfter, and keeps a lock\'s own meta', async () => {
        const fail = (error: Record<string, unknown>) => {
            global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({ success: false, error }) })
            return fetchApi('/api/x', { requireAuth: false }).catch((e) => e)
        }
        const limited = await fail({ code: 'RATE_LIMIT_EXCEEDED', message: 'slow down', retryAfter: 42 })
        expect(limited.meta).toEqual({ retryAfter: 42 })
        const locked = await fail({ code: 'LAB_LOCKED', message: 'locked', meta: { retryAfter: 600, lockedUntil: '2026-01-01T00:00:00.000Z' } })
        expect(locked.meta).toEqual({ retryAfter: 600, lockedUntil: '2026-01-01T00:00:00.000Z' })
        const both = await fail({ code: 'X', message: 'm', retryAfter: 5, meta: { reason: 'r' } })
        expect(both.meta).toEqual({ reason: 'r', retryAfter: 5 })
        const none = await fail({ code: 'X', message: 'm' })
        expect(none.meta).toBeUndefined()
    })

    it('reads the wait from the Retry-After header when the body has none, and lets the body win', async () => {
        const fail = (error: Record<string, unknown>, retryAfter: string | null) => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false, status: 429, headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter : null) },
                json: () => Promise.resolve({ success: false, error }),
            })
            return fetchApi('/api/x', { requireAuth: false }).catch((e) => e)
        }
        expect((await fail({ code: 'RATE_LIMIT_EXCEEDED', message: 'slow' }, '90')).meta).toEqual({ retryAfter: 90 })
        expect((await fail({ code: 'X', message: 'm', meta: { reason: 'r' } }, '30')).meta).toEqual({ reason: 'r', retryAfter: 30 })
        expect((await fail({ code: 'X', message: 'm', retryAfter: 5 }, '90')).meta).toEqual({ retryAfter: 5 })
        // A date, nothing or zero is not a wait
        expect((await fail({ code: 'X', message: 'm' }, 'Wed, 21 Oct 2030 07:28:00 GMT')).meta).toBeUndefined()
        expect((await fail({ code: 'X', message: 'm' }, null)).meta).toBeUndefined()
    })
})
