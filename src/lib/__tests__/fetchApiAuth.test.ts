import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchApi } from '../api'
import { onSessionEnded } from '../authSession'
import { tokenStore } from '../tokenStore'

const failure = (status: number, code: string, message = 'failed') => ({
    ok: false,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve({ success: false, error: { code, message } }),
})
const ok = { ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve({ success: true }) }

const callsTo = (fragment: string) => (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => String(c[0]).includes(fragment))

beforeEach(() => {
    localStorage.clear()
    tokenStore.set('access')
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('which 401 may start a refresh', () => {
    it('does not refresh for a failed sign-in or second factor (calls without the token)', async () => {
        global.fetch = vi.fn().mockResolvedValue(failure(401, 'AUTH_TOKEN_INVALID', 'Invalid credentials'))
        await expect(fetchApi('/api/auth/login', { method: 'POST', requireAuth: false })).rejects.toMatchObject({ status: 401, message: 'Invalid credentials' })
        await expect(fetchApi('/api/auth/2fa/verify', { method: 'POST', requireAuth: false })).rejects.toMatchObject({ status: 401 })
        expect(callsTo('/auth/refresh')).toHaveLength(0)
        // And the signed-in session is untouched by someone else's failed sign-in
        expect(tokenStore.get()).toBe('access')
    })

    it('does not refresh for a 401 without the AUTH_TOKEN_INVALID code', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ message: 'Unauthorized' }) })
        await expect(fetchApi('/api/thing')).rejects.toMatchObject({ status: 401 })
        expect(callsTo('/auth/refresh')).toHaveLength(0)
        expect(tokenStore.get()).toBe('access')
    })

    it('does not refresh when no token was sent', async () => {
        tokenStore.remove()
        global.fetch = vi.fn().mockResolvedValue(failure(401, 'AUTH_TOKEN_INVALID'))
        await expect(fetchApi('/api/thing')).rejects.toMatchObject({ status: 401 })
        expect(callsTo('/auth/refresh')).toHaveLength(0)
    })

    it.each([
        ['AUTH_PASSWORD_INCORRECT', 400],
        ['AUTH_2FA_CODE_INVALID', 400],
        ['RATE_LIMIT_EXCEEDED', 429],
    ])('shows %s as an error, with no refresh and no sign-out', async (code, status) => {
        global.fetch = vi.fn().mockResolvedValue(failure(status, code))
        const ended = vi.fn()
        const stop = onSessionEnded(ended)
        await expect(fetchApi('/api/auth/password', { method: 'PUT' })).rejects.toMatchObject({ status, code })
        stop()
        expect(callsTo('/auth/refresh')).toHaveLength(0)
        expect(ended).not.toHaveBeenCalled()
        expect(tokenStore.get()).toBe('access')
    })
})

describe('codes that end the session', () => {
    it.each([
        [401, 'AUTH_SESSION_REVOKED', 'revoked'],
        [401, 'AUTH_LEGACY_TOKEN_REFUSED', 'legacy'],
        [403, 'AUTH_ACCOUNT_DISABLED', 'disabled'],
    ])('%s %s signs this browser out without a refresh or a retry', async (status, code, reason) => {
        global.fetch = vi.fn().mockResolvedValue(failure(status, code))
        const ended = vi.fn()
        const stop = onSessionEnded(ended)
        await expect(fetchApi('/api/thing')).rejects.toMatchObject({ status, code })
        stop()
        expect(ended).toHaveBeenCalledWith(reason)
        expect(tokenStore.get()).toBeNull()
        expect(callsTo('/auth/refresh')).toHaveLength(0)
        expect(callsTo('/api/thing')).toHaveLength(1)
    })

    it('ignores those codes on a call that carried no token', async () => {
        tokenStore.remove()
        global.fetch = vi.fn().mockResolvedValue(failure(401, 'AUTH_SESSION_REVOKED'))
        const ended = vi.fn()
        const stop = onSessionEnded(ended)
        await expect(fetchApi('/api/thing', { requireAuth: false })).rejects.toMatchObject({ status: 401 })
        stop()
        expect(ended).not.toHaveBeenCalled()
    })
})

describe('refresh trouble keeps the session', () => {
    it('throws the original 401 and keeps the token when the refresh is rate limited', async () => {
        global.fetch = vi.fn().mockImplementation(async (url: string) => (url.includes('/auth/refresh') ? failure(429, 'RATE_LIMIT_EXCEEDED') : failure(401, 'AUTH_TOKEN_INVALID', 'expired')))
        await expect(fetchApi('/api/thing')).rejects.toMatchObject({ status: 401, code: 'AUTH_TOKEN_INVALID' })
        expect(tokenStore.get()).toBe('access')
        expect(callsTo('/api/thing')).toHaveLength(1)
    })
})

describe('cookie', () => {
    it('sends credentials on auth routes only', async () => {
        global.fetch = vi.fn().mockResolvedValue(ok)
        await fetchApi('/api/auth/sessions')
        await fetchApi('/api/blogs')
        expect(callsTo('/api/auth/sessions')[0][1]).toMatchObject({ credentials: 'include' })
        expect(callsTo('/api/blogs')[0][1]).not.toHaveProperty('credentials')
    })
})
