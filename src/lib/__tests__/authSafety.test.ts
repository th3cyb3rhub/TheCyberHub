import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchApi } from '../api'
import { refreshAccessToken, REFRESH_TIMEOUT_MS, LOCK_TIMEOUT_MS } from '../authRefresh'
import { endSession, onSessionEnded } from '../authSession'
import { tokenStore, legacyRefreshToken } from '../tokenStore'
import { createQueryClient } from '../queryClient'

const jwt = (claims: Record<string, unknown>) => {
    const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.signature`
}
const tokenA = jwt({ id: 'user-a', sid: 's1' })
const tokenA2 = jwt({ id: 'user-a', sid: 's2' })
const tokenB = jwt({ id: 'user-b', sid: 's3' })

const reply = (status: number, body: unknown = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
})
const failure = (status: number, code: string) => reply(status, { success: false, error: { code, message: code } })
const isRefresh = (url: unknown) => String(url).endsWith('/api/auth/refresh')
const refreshed = (token: string) => reply(200, { success: true, token })

beforeEach(() => {
    localStorage.clear()
    tokenStore.remove()
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('an answer about an old session', () => {
    it('does not sign out a newer session when an old request comes back as revoked', async () => {
        tokenStore.set(tokenA)
        let release!: () => void
        const gate = new Promise<void>((resolve) => { release = resolve })
        global.fetch = vi.fn().mockImplementation(async () => { await gate; return failure(401, 'AUTH_SESSION_REVOKED') })
        const ended = vi.fn()
        const stop = onSessionEnded(ended)

        const pending = fetchApi('/api/thing').catch((err) => err)
        // The member signs in again (here or in another tab) while the request is out
        tokenStore.set(tokenA2)
        release()
        await expect(pending).resolves.toMatchObject({ code: 'AUTH_SESSION_REVOKED' })
        stop()
        expect(tokenStore.get()).toBe(tokenA2)
        expect(ended).not.toHaveBeenCalled()
    })

    it('still signs out when the refused token is the one stored', async () => {
        tokenStore.set(tokenA)
        global.fetch = vi.fn().mockResolvedValue(failure(401, 'AUTH_SESSION_REVOKED'))
        await expect(fetchApi('/api/thing')).rejects.toMatchObject({ code: 'AUTH_SESSION_REVOKED' })
        expect(tokenStore.get()).toBeNull()
    })

    it('ends a newer session of the same account when the account is disabled, but not another account', () => {
        tokenStore.set(tokenA2)
        endSession('disabled', tokenB)
        expect(tokenStore.get()).toBe(tokenA2)
        endSession('disabled', tokenA)
        expect(tokenStore.get()).toBeNull()
    })

    it('leaves a newer session alone when the refresh of an old one is refused', async () => {
        tokenStore.set(tokenA)
        let release!: () => void
        const gate = new Promise<void>((resolve) => { release = resolve })
        global.fetch = vi.fn().mockImplementation(async () => { await gate; return failure(401, 'AUTH_TOKEN_INVALID') })
        const pending = refreshAccessToken(tokenA)
        tokenStore.set(tokenA2)
        release()
        await expect(pending).resolves.toBe('refreshed')
        expect(tokenStore.get()).toBe(tokenA2)
    })
})

describe('a refresh that finishes after the member left', () => {
    it('does not store its token after a sign-out', async () => {
        tokenStore.set(tokenA)
        let release!: () => void
        const gate = new Promise<void>((resolve) => { release = resolve })
        global.fetch = vi.fn().mockImplementation(async () => { await gate; return refreshed(tokenA2) })
        const pending = refreshAccessToken(tokenA)
        tokenStore.remove()
        release()
        await expect(pending).resolves.toBe('ended')
        expect(tokenStore.get()).toBeNull()
    })

    it('does not overwrite the token of the account that signed in meanwhile', async () => {
        tokenStore.set(tokenA)
        let release!: () => void
        const gate = new Promise<void>((resolve) => { release = resolve })
        global.fetch = vi.fn().mockImplementation(async () => { await gate; return refreshed(tokenA2) })
        const pending = refreshAccessToken(tokenA)
        tokenStore.set(tokenB)
        release()
        await expect(pending).resolves.toBe('refreshed')
        expect(tokenStore.get()).toBe(tokenB)
    })
})

describe('a retry never runs as another account', () => {
    it('throws the original error instead of replaying the call with the other account token', async () => {
        tokenStore.set(tokenA)
        const sent: string[] = []
        global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
            sent.push(String((init.headers as Record<string, string>).Authorization))
            if (isRefresh(url)) return refreshed('unused')
            // While the first call is out, another tab signs A out and B in
            tokenStore.set(tokenB)
            return failure(401, 'AUTH_TOKEN_INVALID')
        })
        await expect(fetchApi('/api/comments', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 401, code: 'AUTH_TOKEN_INVALID' })
        expect(sent).toEqual([`Bearer ${tokenA}`])
    })

    it('retries as usual when the token is renewed for the same account', async () => {
        tokenStore.set(tokenA)
        global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
            if (isRefresh(url)) return refreshed(tokenA2)
            return (init.headers as Record<string, string>).Authorization === `Bearer ${tokenA}` ? failure(401, 'AUTH_TOKEN_INVALID') : reply(200, { ok: 1 })
        })
        await expect(fetchApi('/api/thing')).resolves.toEqual({ ok: 1 })
    })
})

describe('a refresh that does not answer', () => {
    it('gives up after the timeout and keeps the session', async () => {
        vi.useFakeTimers()
        tokenStore.set(tokenA)
        global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }))
        const pending = refreshAccessToken(tokenA)
        await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS + 1)
        await expect(pending).resolves.toBe('unavailable')
        expect(tokenStore.get()).toBe(tokenA)
    })
})

describe('Web Locks', () => {
    it('runs the refresh at once where the browser has no locks', async () => {
        vi.stubGlobal('navigator', { ...navigator, locks: undefined })
        tokenStore.set(tokenA)
        global.fetch = vi.fn().mockResolvedValue(refreshed(tokenA2))
        await expect(refreshAccessToken(tokenA)).resolves.toBe('refreshed')
        expect(tokenStore.get()).toBe(tokenA2)
    })

    it('runs under the named lock, once for a token that was already replaced', async () => {
        // A lock that serialises its holders, as the real one does
        let tail: Promise<unknown> = Promise.resolve()
        const request = vi.fn((_name: string, _options: unknown, task: () => Promise<unknown>) => {
            const run = tail.then(task)
            tail = run.catch(() => {})
            return run
        })
        vi.stubGlobal('navigator', { ...navigator, locks: { request } })
        tokenStore.set(tokenA)
        global.fetch = vi.fn().mockResolvedValue(refreshed(tokenA2))

        await expect(refreshAccessToken(tokenA)).resolves.toBe('refreshed')
        // A later failure that still carries the replaced token just retries: no second lock, no second call
        await expect(refreshAccessToken(tokenA)).resolves.toBe('refreshed')
        expect(request).toHaveBeenCalledTimes(1)
        expect(global.fetch).toHaveBeenCalledTimes(1)
        expect(request.mock.calls[0][0]).toBe('thecyberhub-auth-refresh')
    })

    it('does not ask again inside the lock when another tab already stored a new token', async () => {
        let release!: () => void
        const held = new Promise<void>((resolve) => { release = resolve })
        const request = vi.fn(async (_name: string, _options: unknown, task: () => Promise<unknown>) => { await held; return task() })
        vi.stubGlobal('navigator', { ...navigator, locks: { request } })
        tokenStore.set(tokenA)
        global.fetch = vi.fn()
        const pending = refreshAccessToken(tokenA)
        // The tab that held the lock stored its result
        tokenStore.set(tokenA2)
        release()
        await expect(pending).resolves.toBe('refreshed')
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it('gives up waiting for a lock that is held too long, keeping the session', async () => {
        vi.useFakeTimers()
        const request = vi.fn((_name: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }))
        vi.stubGlobal('navigator', { ...navigator, locks: { request } })
        tokenStore.set(tokenA)
        global.fetch = vi.fn()
        const pending = refreshAccessToken(tokenA)
        await vi.advanceTimersByTimeAsync(LOCK_TIMEOUT_MS + 1)
        await expect(pending).resolves.toBe('unavailable')
        expect(tokenStore.get()).toBe(tokenA)
        expect(global.fetch).not.toHaveBeenCalled()
    })
})

describe('query retries', () => {
    const retry = createQueryClient().getDefaultOptions().queries!.retry as (count: number, error: unknown) => boolean

    it('does not retry an answer the API gave on purpose', () => {
        expect(retry(0, { status: 401 })).toBe(false)
        expect(retry(0, { status: 429 })).toBe(false)
        expect(retry(0, { status: 404 })).toBe(false)
    })

    it('retries server trouble and network errors up to 3 times', () => {
        expect(retry(0, { status: 503 })).toBe(true)
        expect(retry(2, new TypeError('Failed to fetch'))).toBe(true)
        expect(retry(3, { status: 503 })).toBe(false)
    })
})

describe('a legacy refresh token', () => {
    it('is dropped once a refresh used it', async () => {
        localStorage.setItem('refreshToken', 'old-refresh')
        tokenStore.set(tokenA)
        global.fetch = vi.fn().mockResolvedValue(refreshed(tokenA2))
        await refreshAccessToken(tokenA)
        expect(JSON.parse(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body))).toEqual({ refreshToken: 'old-refresh' })
        expect(legacyRefreshToken.get()).toBeNull()
    })
})
