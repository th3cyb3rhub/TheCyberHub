import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const push = vi.hoisted(() => ({ unsubscribeThisDevice: vi.fn() }))
const nav = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('@/lib/push', () => push)
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }) }))

import { AuthProvider, useAuth } from '../AuthContext'
import { stashPending2fa, takePending2fa } from '@/lib/pending2fa'
import { takeSessionNotice } from '@/lib/authSession'
import { tokenStore } from '@/lib/tokenStore'
import { fetchApi } from '@/lib/api'

type Handler = (url: string, init: RequestInit) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>

const respond = ({ status, body = {} }: { status: number; body?: unknown }) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
})

const ada = { id: 'u1', username: 'ada', role: 'user' }
const meOk = { status: 200, body: { success: true, data: ada } }
const invalid = { status: 401, body: { success: false, error: { code: 'AUTH_TOKEN_INVALID', message: 'Invalid or expired token' } } }

let handler: Handler
const calls = () => (global.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][]
const callsTo = (fragment: string) => calls().filter(([url]) => url.includes(fragment))

let api: ReturnType<typeof useAuth>
function Probe() {
    api = useAuth()
    return (
        <div>
            <span data-testid="user">{api.user ? api.user.username : 'none'}</span>
            <span data-testid="loading">{String(api.loading)}</span>
            <span data-testid="token">{api.token ?? 'none'}</span>
        </div>
    )
}

let queryClient: QueryClient
const mount = () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>)
}

beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/notifications?tab=all')
    push.unsubscribeThisDevice.mockResolvedValue(undefined)
    handler = (url) => (url.includes('/api/auth/me') ? meOk : { status: 200, body: { success: true } })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init: RequestInit) => respond(await handler(url, init))))
})

const signedIn = async () => {
    window.localStorage.setItem('token', 'tok-1')
    mount()
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('ada'))
}

describe('loading the signed-in user', () => {
    it('reads the account once for a stored token', async () => {
        await signedIn()
        expect(callsTo('/api/auth/me')).toHaveLength(1)
        expect(screen.getByTestId('loading')).toHaveTextContent('false')
        expect(screen.getByTestId('token')).toHaveTextContent('tok-1')
    })

    it('does not call the API for a visitor', async () => {
        mount()
        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
        expect(calls()).toHaveLength(0)
        expect(screen.getByTestId('user')).toHaveTextContent('none')
    })

    it('renews an expired access token once and then shows the account', async () => {
        let first = true
        handler = (url) => {
            if (url.includes('/api/auth/refresh')) return { status: 200, body: { success: true, token: 'tok-2' } }
            if (url.includes('/api/auth/me')) {
                if (first) { first = false; return invalid }
                return meOk
            }
            return { status: 200 }
        }
        await signedIn()
        expect(callsTo('/api/auth/refresh')).toHaveLength(1)
        expect(screen.getByTestId('token')).toHaveTextContent('tok-2')
    })

    it('keeps the token and shows no user when the API cannot be reached', async () => {
        handler = () => { throw new TypeError('Failed to fetch') }
        window.localStorage.setItem('token', 'tok-1')
        mount()
        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
        expect(screen.getByTestId('user')).toHaveTextContent('none')
        expect(window.localStorage.getItem('token')).toBe('tok-1')
    })

    it('goes quietly to signed out when the stored token and the refresh are both refused', async () => {
        handler = (url) => (url.includes('/api/auth/refresh') ? invalid : invalid)
        window.localStorage.setItem('token', 'tok-1')
        mount()
        await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('none'))
        expect(screen.getByTestId('user')).toHaveTextContent('none')
        // A visitor with an old token is not sent anywhere
        expect(nav.replace).not.toHaveBeenCalled()
    })
})

describe('signing in', () => {
    it('stores the token, shows the user and sends the cookie, with no refresh on failure', async () => {
        mount()
        handler = (url) => (url.includes('/auth/login') ? { status: 200, body: { success: true, token: 'tok-9', data: ada } } : { status: 200 })
        await act(async () => { await api.login('ada@example.com', 'Secret-123') })
        expect(screen.getByTestId('user')).toHaveTextContent('ada')
        expect(window.localStorage.getItem('token')).toBe('tok-9')
        expect(callsTo('/auth/login')[0][1]).toMatchObject({ credentials: 'include', method: 'POST' })
        expect(callsTo('/api/auth/me')).toHaveLength(0)
    })

    it('does not refresh or touch the session when the login is refused', async () => {
        mount()
        handler = () => ({ status: 401, body: { success: false, error: { code: 'AUTH_TOKEN_INVALID', message: 'Invalid credentials' } } })
        await act(async () => {
            await expect(api.login('a@b.co', 'bad')).rejects.toMatchObject({ message: 'Invalid credentials', status: 401 })
        })
        expect(callsTo('/auth/refresh')).toHaveLength(0)
        expect(window.localStorage.getItem('token')).toBeNull()
    })

    it('shows a wrong second-step code as the server words it, with no renewal and no sign-out', async () => {
        await signedIn()
        handler = () => ({ status: 400, body: { success: false, error: { code: 'AUTH_2FA_CODE_INVALID', message: 'The two-factor code is invalid' } } })
        await act(async () => {
            await expect(api.verify2faLogin('temp-1', '000000')).rejects.toMatchObject({ status: 400, code: 'AUTH_2FA_CODE_INVALID', message: 'The two-factor code is invalid' })
        })
        expect(callsTo('/auth/refresh')).toHaveLength(0)
        expect(window.localStorage.getItem('token')).toBe('tok-1')
        expect(nav.replace).not.toHaveBeenCalled()
    })

    it('shows the wait of a rate limited sign-in', async () => {
        mount()
        handler = () => ({ status: 429, body: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts.', meta: { retryAfter: 600 } } } })
        await act(async () => {
            await expect(api.login('a@b.co', 'bad')).rejects.toThrow('Too many attempts. Try again in 10 minutes.')
        })
    })

    it('hands a second step back without signing in', async () => {
        mount()
        handler = () => ({ status: 200, body: { success: true, requires2FA: true, tempToken: 'temp-1' } })
        let result: unknown
        await act(async () => { result = await api.login('ada@example.com', 'Secret-123') })
        expect(result).toEqual({ requires2FA: true, tempToken: 'temp-1' })
        expect(window.localStorage.getItem('token')).toBeNull()
        handler = () => ({ status: 200, body: { success: true, token: 'tok-2fa', data: ada } })
        await act(async () => { await api.verify2faLogin('temp-1', '123456') })
        expect(JSON.parse(String(callsTo('/auth/2fa/verify')[0]?.[1]?.body ?? '{}'))).toEqual({ tempToken: 'temp-1', code: '123456' })
        expect(screen.getByTestId('user')).toHaveTextContent('ada')
    })

    it('signs in with an OAuth provider, or hands back its second step', async () => {
        mount()
        handler = () => ({ status: 200, body: { success: true, requires2FA: true, tempToken: 't' } })
        let result: unknown
        await act(async () => { result = await api.loginWithGoogle('id-token') })
        expect(result).toEqual({ requires2FA: true, tempToken: 't' })
        expect(JSON.parse(String(callsTo('/auth/oauth/google')[0][1].body))).toEqual({ idToken: 'id-token' })
        handler = () => ({ status: 200, body: { success: true, token: 'tok-gh', data: ada } })
        await act(async () => { await api.loginWithGithub('code-1') })
        expect(JSON.parse(String(callsTo('/auth/oauth/github')[0][1].body))).toEqual({ code: 'code-1' })
        expect(window.localStorage.getItem('token')).toBe('tok-gh')
    })
})

describe('logout', () => {
    it('calls the server with the session token, then clears the token, user, cache and a pending second step', async () => {
        await signedIn()
        stashPending2fa('temp-left-over')
        queryClient.setQueryData(['feed'], { items: [1] })
        await act(async () => { await api.logout() })

        const [, init] = callsTo('/api/auth/logout')[0]
        expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')
        expect(window.localStorage.getItem('token')).toBeNull()
        expect(screen.getByTestId('user')).toHaveTextContent('none')
        expect(queryClient.getQueryData(['feed'])).toBeUndefined()
        expect(takePending2fa()).toBeNull()
        // The member chose this: nothing sends them to sign-in with a notice
        expect(nav.replace).not.toHaveBeenCalled()
    })

    it('stops pushes to this browser, using the token it is about to clear', async () => {
        await signedIn()
        let tokenWhenCalled: string | null = 'unset'
        push.unsubscribeThisDevice.mockImplementation(async () => { tokenWhenCalled = window.localStorage.getItem('token') })
        await act(async () => { await api.logout() })
        expect(push.unsubscribeThisDevice).toHaveBeenCalledWith('tok-1')
        // It was started before the token was removed
        expect(tokenWhenCalled).toBe('tok-1')
    })

    it('still signs out when the unsubscribe fails or throws at once', async () => {
        await signedIn()
        push.unsubscribeThisDevice.mockRejectedValue(new Error('offline'))
        await act(async () => { await api.logout() })
        expect(screen.getByTestId('user')).toHaveTextContent('none')

        act(() => { tokenStore.set('tok-1') })
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('ada'))
        push.unsubscribeThisDevice.mockImplementation(() => { throw new Error('no service worker') })
        await act(async () => { await api.logout() })
        expect(screen.getByTestId('user')).toHaveTextContent('none')
        expect(window.localStorage.getItem('token')).toBeNull()
    })

    it('still signs this device out when the server cannot be reached or the session is already gone', async () => {
        await signedIn()
        handler = () => { throw new TypeError('Failed to fetch') }
        await act(async () => { await api.logout() })
        expect(screen.getByTestId('user')).toHaveTextContent('none')

        act(() => { tokenStore.set('tok-1') })
        handler = (url) => (url.includes('/logout') ? { status: 401, body: { error: { code: 'AUTH_SESSION_REVOKED', message: 'ended' } } } : meOk)
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('ada'))
        await act(async () => { await api.logout() })
        expect(window.localStorage.getItem('token')).toBeNull()
        expect(nav.replace).not.toHaveBeenCalled()
    })

    it('signs out everywhere only when the server confirms it', async () => {
        await signedIn()
        handler = (url) => (url.includes('/logout') ? { status: 500, body: { error: { code: 'INTERNAL', message: 'boom' } } } : meOk)
        await act(async () => {
            await expect(api.logout({ allDevices: true })).rejects.toBeTruthy()
        })
        expect(JSON.parse(String(callsTo('/api/auth/logout')[0][1].body))).toEqual({ allDevices: true })
        // Still signed in here, so the member can try again
        expect(window.localStorage.getItem('token')).toBe('tok-1')
        expect(screen.getByTestId('user')).toHaveTextContent('ada')

        handler = (url) => (url.includes('/logout') ? { status: 200, body: { success: true } } : meOk)
        await act(async () => { await api.logout({ allDevices: true }) })
        expect(window.localStorage.getItem('token')).toBeNull()
    })
})

describe('a session the API ended', () => {
    it('signs a signed-in member out and leaves a note for the sign-in page, without moving them off a public page', async () => {
        await signedIn()
        handler = () => ({ status: 401, body: { success: false, error: { code: 'AUTH_SESSION_REVOKED', message: 'This session has ended.' } } })
        await act(async () => {
            await expect(api.updateProfile({ name: 'Ada' })).rejects.toMatchObject({ code: 'AUTH_SESSION_REVOKED' })
        })
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'))
        expect(window.localStorage.getItem('token')).toBeNull()
        // Pages that need a member send them to sign-in themselves; a public page carries on signed out
        expect(nav.replace).not.toHaveBeenCalled()
        expect(takeSessionNotice()).toBe('This device was signed out. Please sign in again.')
    })

    it('takes a disabled account to sign-in at once, back to this page, with a note', async () => {
        await signedIn()
        handler = () => ({ status: 403, body: { success: false, error: { code: 'AUTH_ACCOUNT_DISABLED', message: 'disabled' } } })
        await act(async () => {
            await expect(api.updateProfile({ name: 'Ada' })).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_DISABLED' })
        })
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/auth?redirect=%2Fnotifications%3Ftab%3Dall'))
        expect(takeSessionNotice()).toContain('disabled')
    })

    it('does not send anyone away from the sign-in page', async () => {
        window.history.replaceState({}, '', '/auth')
        await signedIn()
        handler = () => ({ status: 401, body: { error: { code: 'AUTH_SESSION_REVOKED', message: 'ended' } } })
        await act(async () => {
            await expect(api.updateProfile({ name: 'Ada' })).rejects.toBeTruthy()
        })
        expect(nav.replace).not.toHaveBeenCalled()
    })

    it('forgets the cache of the previous account when the token goes away in another tab', async () => {
        await signedIn()
        queryClient.setQueryData(['feed'], { items: [1] })
        act(() => { tokenStore.remove() })
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'))
        expect(queryClient.getQueryData(['feed'])).toBeUndefined()
    })
})

describe('account changes', () => {
    it('keeps the session on the new token after a password change', async () => {
        await signedIn()
        handler = (url) => (url.includes('/auth/password') ? { status: 200, body: { success: true, token: 'tok-new', revokedSessions: 3 } } : meOk)
        let result: unknown
        await act(async () => { result = await api.updatePassword('Old-pass-1!', 'New-pass-1!') })
        expect(result).toEqual({ revokedSessions: 3 })
        expect(window.localStorage.getItem('token')).toBe('tok-new')
        expect(callsTo('/auth/password')[0][1]).toMatchObject({ method: 'PUT' })
        expect(screen.getByTestId('user')).toHaveTextContent('ada')
    })

    it('shows a wrong current password as an error without refreshing or signing out', async () => {
        await signedIn()
        handler = (url) => (url.includes('/auth/password') ? { status: 400, body: { error: { code: 'AUTH_PASSWORD_INCORRECT', message: 'The password is incorrect' } } } : meOk)
        await act(async () => {
            await expect(api.updatePassword('wrong', 'New-pass-1!')).rejects.toMatchObject({ code: 'AUTH_PASSWORD_INCORRECT', message: 'The password is incorrect' })
        })
        expect(callsTo('/auth/refresh')).toHaveLength(0)
        expect(window.localStorage.getItem('token')).toBe('tok-1')
        expect(screen.getByTestId('user')).toHaveTextContent('ada')
    })

    it('replaces the user with what the profile update returns', async () => {
        await signedIn()
        handler = (url, init) => (init.method === 'PUT' && url.includes('/auth/me') ? { status: 200, body: { success: true, data: { ...ada, username: 'ada2' } } } : meOk)
        await act(async () => { await api.updateProfile({ username: 'ada2' }) })
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('ada2'))
    })

    it('reads the account again on refreshUser', async () => {
        await signedIn()
        handler = (url) => (url.includes('/auth/me') ? { status: 200, body: { data: { ...ada, username: 'grace' } } } : { status: 200 })
        await act(async () => { await api.refreshUser() })
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('grace'))
    })
})


const jwt = (claims: Record<string, unknown>) => {
    const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.signature`
}

describe('one account after another in the same browser', () => {
    const tokenA = jwt({ id: 'u1', sid: 's1' })
    const tokenB = jwt({ id: 'u2', sid: 's2' })
    const grace = { id: 'u2', username: 'grace', role: 'user' }
    // The API answers for whoever the bearer token names
    const byBearer = (url: string, init: RequestInit) => {
        if (!url.includes('/api/auth/me')) return { status: 200, body: { success: true } }
        const bearer = String((init.headers as Record<string, string>).Authorization ?? '')
        return { status: 200, body: { success: true, data: bearer.includes(tokenB) ? grace : ada } }
    }

    it('keys the account by the id in the token', async () => {
        handler = byBearer
        window.localStorage.setItem('token', tokenA)
        mount()
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('ada'))
        expect(queryClient.getQueryData(['auth', 'me', 'u1'])).toMatchObject({ username: 'ada' })
        expect(queryClient.getQueryData(['auth', 'me', 'unknown'])).toBeUndefined()
    })

    it('shows the second account and none of the first when another tab signs in as someone else', async () => {
        handler = byBearer
        window.localStorage.setItem('token', tokenA)
        mount()
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('ada'))
        queryClient.setQueryData(['feed'], { items: ['ada only'] })

        act(() => { tokenStore.set(tokenB) })
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('grace'))
        expect(queryClient.getQueryData(['feed'])).toBeUndefined()
        expect(queryClient.getQueryData(['auth', 'me', 'u1'])).toBeUndefined()
        expect(queryClient.getQueryData(['auth', 'me', 'u2'])).toMatchObject({ username: 'grace' })
    })

    it('shows the second account and none of the first after a sign-in here', async () => {
        handler = byBearer
        window.localStorage.setItem('token', tokenA)
        mount()
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('ada'))
        queryClient.setQueryData(['feed'], { items: ['ada only'] })

        handler = (url, init) => (url.includes('/auth/login') ? { status: 200, body: { success: true, token: tokenB, data: grace } } : byBearer(url, init))
        await act(async () => { await api.login('grace@example.com', 'Secret-123') })
        expect(screen.getByTestId('user')).toHaveTextContent('grace')
        expect(queryClient.getQueryData(['feed'])).toBeUndefined()
        expect(queryClient.getQueryData(['auth', 'me', 'u1'])).toBeUndefined()
    })
})

describe('components that are mounted while the account changes', () => {
    const tokenA = jwt({ id: 'u1', sid: 's1' })
    const tokenB = jwt({ id: 'u2', sid: 's2' })
    // Reads nothing from useAuth: it re-renders only when its own query changes
    function Feed() {
        const feed = useQuery({ queryKey: ['feed'], queryFn: () => fetchApi('/api/feed') })
        return <span data-testid="feed">{feed.data ? feed.data.owner : 'none'}</span>
    }
    const bearerOwner = (init: RequestInit) => (String((init.headers as Record<string, string>).Authorization).includes(tokenB) ? 'grace' : 'ada')
    const answer = (url: string, init: RequestInit) => {
        if (url.includes('/api/feed')) return { status: 200, body: { owner: bearerOwner(init) } }
        if (url.includes('/api/auth/me')) return { status: 200, body: { success: true, data: bearerOwner(init) === 'grace' ? { id: 'u2', username: 'grace', role: 'user' } : ada } }
        return { status: 200, body: { success: true } }
    }
    const mountWithFeed = () => {
        queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        // The feed sits outside AuthProvider's children chain of useAuth consumers: it is a sibling
        return render(<QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider><Feed /></QueryClientProvider>)
    }

    it('show the new account after a sign-in in another tab (storage event), not the old one', async () => {
        handler = answer
        window.localStorage.setItem('token', tokenA)
        mountWithFeed()
        await waitFor(() => expect(screen.getByTestId('feed')).toHaveTextContent('ada'))

        act(() => {
            window.localStorage.setItem('token', tokenB)
            window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: tokenB }))
        })
        await waitFor(() => expect(screen.getByTestId('feed')).toHaveTextContent('grace'))
        expect(screen.getByTestId('user')).toHaveTextContent('grace')
    })

    it('show the new account after a sign-in here', async () => {
        handler = answer
        window.localStorage.setItem('token', tokenA)
        mountWithFeed()
        await waitFor(() => expect(screen.getByTestId('feed')).toHaveTextContent('ada'))

        handler = (url, init) => (url.includes('/auth/login') ? { status: 200, body: { success: true, token: tokenB, data: { id: 'u2', username: 'grace', role: 'user' } } } : answer(url, init))
        await act(async () => { await api.login('grace@example.com', 'Secret-123') })
        await waitFor(() => expect(screen.getByTestId('feed')).toHaveTextContent('grace'))
    })

    it('stop showing the old account after a sign-out', async () => {
        handler = answer
        window.localStorage.setItem('token', tokenA)
        mountWithFeed()
        await waitFor(() => expect(screen.getByTestId('feed')).toHaveTextContent('ada'))
        handler = (url, init) => (url.includes('/api/feed') ? { status: 401, body: { error: { code: 'X', message: 'sign in' } } } : answer(url, init))
        await act(async () => { await api.logout() })
        await waitFor(() => expect(screen.getByTestId('feed')).toHaveTextContent('none'))
    })
})

describe('signing out without a usable access token', () => {
    it('still asks the server, with the cookie, when there is no token at all', async () => {
        mount()
        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
        await act(async () => { await api.logout() })
        const [call] = callsTo('/api/auth/logout')
        expect(call).toBeDefined()
        expect(call[1]).toMatchObject({ method: 'POST', credentials: 'include' })
        expect((call[1].headers as Record<string, string>).Authorization).toBeUndefined()
    })

    it('completes with an expired access token and starts no renewal: the server ends the session by the cookie', async () => {
        await signedIn()
        handler = (url) => (url.includes('/logout') ? { status: 200, body: { success: true, message: 'Logged out successfully' } } : url.includes('/refresh') ? invalid : meOk)
        await act(async () => { await api.logout() })
        expect(callsTo('/api/auth/logout')).toHaveLength(1)
        expect(callsTo('/api/auth/refresh')).toHaveLength(0)
        expect(window.localStorage.getItem('token')).toBeNull()
        expect(screen.getByTestId('user')).toHaveTextContent('none')
    })

    it('ends this device even when the server refuses because the token is gone', async () => {
        await signedIn()
        handler = (url) => (url.includes('/logout') ? invalid : url.includes('/refresh') ? invalid : meOk)
        await act(async () => { await api.logout() })
        expect(window.localStorage.getItem('token')).toBeNull()
        expect(screen.getByTestId('user')).toHaveTextContent('none')
    })

    it('reports that "everywhere" did not complete, but clears this device, when a failed renewal already ended it', async () => {
        await signedIn()
        stashPending2fa('temp-left-over')
        handler = (url) => (url.includes('/logout') || url.includes('/refresh') ? invalid : meOk)
        await act(async () => {
            await expect(api.logout({ allDevices: true })).rejects.toBeTruthy()
        })
        expect(window.localStorage.getItem('token')).toBeNull()
        expect(takePending2fa()).toBeNull()
    })
})

describe('a refresh token an older version stored', () => {
    it('is replaced by the cookie flow when the app starts, and dropped', async () => {
        window.localStorage.setItem('refreshToken', 'old-refresh')
        handler = (url) => (url.includes('/api/auth/refresh') ? { status: 200, body: { success: true, token: 'tok-new' } } : meOk)
        window.localStorage.setItem('token', 'tok-1')
        mount()
        await waitFor(() => expect(window.localStorage.getItem('refreshToken')).toBeNull())
        expect(JSON.parse(String(callsTo('/api/auth/refresh')[0][1].body))).toEqual({ refreshToken: 'old-refresh' })
    })

    it('is dropped without a call when there is no session to renew', async () => {
        window.localStorage.setItem('refreshToken', 'old-refresh')
        mount()
        await waitFor(() => expect(window.localStorage.getItem('refreshToken')).toBeNull())
        expect(callsTo('/api/auth/refresh')).toHaveLength(0)
    })
})
