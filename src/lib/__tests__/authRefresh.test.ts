import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchApi, API_URL } from '../api'
import { refreshAccessToken } from '../authRefresh'
import { onSessionEnded } from '../authSession'
import { tokenStore } from '../tokenStore'

type Reply = { status: number; body?: unknown; headers?: Record<string, string> }

const reply = ({ status, body = {}, headers = {} }: Reply) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: () => Promise.resolve(body),
})

const invalid = reply({ status: 401, body: { success: false, error: { code: 'AUTH_TOKEN_INVALID', message: 'Invalid or expired token' } } })
const ok = (data: unknown = { ok: true }) => reply({ status: 200, body: data })
const refreshed = (token: string) => reply({ status: 200, body: { success: true, token, refreshToken: 'r', expiresIn: 900 } })

/** A fake API: the handler answers by URL and sees every call in order. */
function api(handler: (url: string, init: RequestInit, n: number) => ReturnType<typeof reply> | Promise<ReturnType<typeof reply>>) {
    const calls: { url: string; init: RequestInit }[] = []
    global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return handler(url, init, calls.length)
    })
    return {
        calls,
        refreshCalls: () => calls.filter((c) => c.url.endsWith('/api/auth/refresh')),
        authHeader: (i: number) => (calls[i].init.headers as Record<string, string>).Authorization,
    }
}

const isRefresh = (url: string) => url.endsWith('/api/auth/refresh')

beforeEach(() => {
    localStorage.clear()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('single-flight refresh', () => {
    it('renews once for requests that fail together, and retries each of them once', async () => {
        tokenStore.set('old')
        let release!: () => void
        const gate = new Promise<void>((resolve) => { release = resolve })
        const fake = api(async (url, init) => {
            if (isRefresh(url)) { await gate; return refreshed('new') }
            return (init.headers as Record<string, string>).Authorization === 'Bearer old' ? invalid : ok({ url })
        })

        const pending = [fetchApi('/api/a'), fetchApi('/api/b'), fetchApi('/api/c')]
        // Let all three get their 401 while the one refresh is still waiting
        await vi.waitFor(() => expect(fake.calls.filter((c) => !isRefresh(c.url)).length).toBe(3))
        release()
        const results = await Promise.all(pending)

        expect(results.map((r) => r.url)).toEqual([`${API_URL}/api/a`, `${API_URL}/api/b`, `${API_URL}/api/c`])
        expect(fake.refreshCalls()).toHaveLength(1)
        // 3 first tries + 1 refresh + 3 retries, each retry with the new token
        expect(fake.calls).toHaveLength(7)
        expect(fake.calls.filter((c) => !isRefresh(c.url)).slice(3).every((c) => (c.init.headers as Record<string, string>).Authorization === 'Bearer new')).toBe(true)
        expect(tokenStore.get()).toBe('new')
    })

    it('does not refresh again for a request that fails after the token was already replaced', async () => {
        tokenStore.set('old')
        let slowAttempts = 0
        const fake = api(async (url, init) => {
            if (isRefresh(url)) return refreshed('new')
            const bearer = (init.headers as Record<string, string>).Authorization
            if (bearer === 'Bearer old') {
                // The second request is answered after the first one's refresh has finished
                if (url.endsWith('/slow')) { slowAttempts += 1; await new Promise((r) => setTimeout(r, 30)) }
                return invalid
            }
            return ok({ url })
        })

        const first = fetchApi('/api/fast')
        const second = fetchApi('/api/slow')
        await Promise.all([first, second])

        expect(slowAttempts).toBe(1)
        expect(fake.refreshCalls()).toHaveLength(1)
    })

    it('shares the outcome with every waiter when the refresh is refused', async () => {
        tokenStore.set('old')
        const ended = vi.fn()
        const stop = onSessionEnded(ended)
        const fake = api((url) => (isRefresh(url) ? reply({ status: 401, body: { error: { code: 'AUTH_TOKEN_INVALID', message: 'Invalid or expired refresh token' } } }) : invalid))

        const results = await Promise.allSettled([fetchApi('/api/a'), fetchApi('/api/b')])
        stop()

        expect(results.every((r) => r.status === 'rejected')).toBe(true)
        expect(fake.refreshCalls()).toHaveLength(1)
        expect(tokenStore.get()).toBeNull()
        // One sign-out announcement, not one per request
        expect(ended).toHaveBeenCalledTimes(1)
        expect(ended).toHaveBeenCalledWith('expired')
    })

    it('asks again after a finished refresh when a later request is refused with the new token', async () => {
        tokenStore.set('t0')
        let n = 0
        const fake = api((url) => {
            if (isRefresh(url)) { n += 1; return refreshed(`t${n}`) }
            return invalid
        })
        // Both attempts are refused by the API: the retry is not retried
        await expect(fetchApi('/api/a')).rejects.toMatchObject({ status: 401, code: 'AUTH_TOKEN_INVALID' })
        expect(fake.refreshCalls()).toHaveLength(1)
        expect(fake.calls.filter((c) => !isRefresh(c.url))).toHaveLength(2)
        await expect(fetchApi('/api/b')).rejects.toMatchObject({ status: 401 })
        expect(fake.refreshCalls()).toHaveLength(2)
    })
})

describe('refresh outcomes', () => {
    it('sends the cookie and no body fields when there is no fallback token', async () => {
        tokenStore.set('old')
        const fake = api((url) => (isRefresh(url) ? refreshed('new') : ok()))
        await expect(refreshAccessToken('old')).resolves.toBe('refreshed')
        expect(fake.calls[0].url).toBe(`${API_URL}/api/auth/refresh`)
        expect(fake.calls[0].init).toMatchObject({ method: 'POST', credentials: 'include', body: '{}' })
    })

    it('waits and asks once more when the API reports a refresh race, without signing out', async () => {
        tokenStore.set('old')
        const ended = vi.fn()
        const stop = onSessionEnded(ended)
        let refreshes = 0
        const fake = api((url) => {
            if (!isRefresh(url)) return ok()
            refreshes += 1
            return refreshes === 1
                ? reply({ status: 401, body: { error: { code: 'AUTH_REFRESH_RACE', message: 'race' } } })
                : refreshed('winner-next')
        })
        await expect(refreshAccessToken('old')).resolves.toBe('refreshed')
        stop()
        expect(fake.refreshCalls()).toHaveLength(2)
        expect(tokenStore.get()).toBe('winner-next')
        expect(ended).not.toHaveBeenCalled()
    })

    it('takes the token another tab stored during a race instead of asking again', async () => {
        tokenStore.set('old')
        const fake = api((url) => {
            if (isRefresh(url)) {
                // The other tab finishes while this one waits out the race
                setTimeout(() => tokenStore.set('from-other-tab'), 20)
                return reply({ status: 401, body: { error: { code: 'AUTH_REFRESH_RACE', message: 'race' } } })
            }
            return ok()
        })
        await expect(refreshAccessToken('old')).resolves.toBe('refreshed')
        expect(fake.refreshCalls()).toHaveLength(1)
        expect(tokenStore.get()).toBe('from-other-tab')
    })

    it('keeps the session when the race repeats', async () => {
        tokenStore.set('old')
        const fake = api(() => reply({ status: 401, body: { error: { code: 'AUTH_REFRESH_RACE', message: 'race' } } }))
        await expect(refreshAccessToken('old')).resolves.toBe('unavailable')
        expect(fake.refreshCalls()).toHaveLength(2)
        expect(tokenStore.get()).toBe('old')
    })

    it.each([
        ['a rate limit', reply({ status: 429, body: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'slow down' } } })],
        ['a server error', reply({ status: 503 })],
    ])('keeps the token on %s', async (_name, response) => {
        tokenStore.set('old')
        api(() => response)
        await expect(refreshAccessToken('old')).resolves.toBe('unavailable')
        expect(tokenStore.get()).toBe('old')
    })

    it('keeps the token when the network is down', async () => {
        tokenStore.set('old')
        global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
        await expect(refreshAccessToken('old')).resolves.toBe('unavailable')
        expect(tokenStore.get()).toBe('old')
    })

    it.each([
        ['an invalid refresh token', reply({ status: 401, body: { error: { code: 'AUTH_TOKEN_INVALID', message: 'x' } } }), 'expired'],
        ['no refresh token to send', reply({ status: 400, body: { error: { code: 'BAD_REQUEST', message: 'Refresh token is required' } } }), 'expired'],
        ['a disabled account', reply({ status: 403, body: { error: { code: 'AUTH_ACCOUNT_DISABLED', message: 'disabled' } } }), 'disabled'],
        ['an answer without a token', reply({ status: 200, body: { success: true } }), 'expired'],
    ])('signs out on %s', async (_name, response, reason) => {
        tokenStore.set('old')
        const ended = vi.fn()
        const stop = onSessionEnded(ended)
        api(() => response)
        await expect(refreshAccessToken('old')).resolves.toBe('ended')
        stop()
        expect(tokenStore.get()).toBeNull()
        expect(ended).toHaveBeenCalledWith(reason)
    })

    it('does nothing when there is no token any more', async () => {
        const fake = api(() => ok())
        await expect(refreshAccessToken('gone')).resolves.toBe('ended')
        expect(fake.calls).toHaveLength(0)
    })
})
