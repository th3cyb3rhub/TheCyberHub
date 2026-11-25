import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { legacyRefreshToken, tokenStore, tokenUserId } from '../tokenStore'

const jwt = (claims: Record<string, unknown>) => {
    const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.signature`
}

beforeEach(() => localStorage.clear())

describe('tokenStore subscriptions', () => {
    it('tells subscribers when the token is set, replaced and removed, and not when nothing changed', () => {
        const listener = vi.fn()
        const stop = tokenStore.subscribe(listener)
        tokenStore.set('a')
        tokenStore.set('a')
        tokenStore.set('b')
        tokenStore.remove()
        tokenStore.remove()
        stop()
        tokenStore.set('c')
        expect(listener).toHaveBeenCalledTimes(3)
    })

    it('follows a change made in another tab', () => {
        const listener = vi.fn()
        const stop = tokenStore.subscribe(listener)
        window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: 'x' }))
        window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }))
        window.dispatchEvent(new StorageEvent('storage', { key: null }))
        stop()
        expect(listener).toHaveBeenCalledTimes(2)
    })
})

describe('legacyRefreshToken', () => {
    it('reads and drops a refresh token an older version stored', () => {
        localStorage.setItem('refreshToken', 'old')
        expect(legacyRefreshToken.get()).toBe('old')
        legacyRefreshToken.remove()
        expect(legacyRefreshToken.get()).toBeNull()
    })
})

describe('tokenSessionId', () => {
    it('reads the session id, which a renewed token keeps', async () => {
        const { tokenSessionId } = await import('../tokenStore')
        expect(tokenSessionId(jwt({ id: 'u', sid: 's-9' }))).toBe('s-9')
        expect(tokenSessionId(jwt({ id: 'u' }))).toBeNull()
        expect(tokenSessionId('junk')).toBeNull()
    })
})

describe('tokenUserId', () => {
    it('reads the account id from an access token', () => {
        expect(tokenUserId(jwt({ id: 'u-123', type: 'access', sid: 's' }))).toBe('u-123')
    })

    it.each([null, undefined, '', 'not-a-jwt', 'a.b.c', `x.${btoa('{"id":42}')}.y`, `x.${btoa('{}')}.y`])('gives null for %j', (token) => {
        expect(tokenUserId(token as string | null | undefined)).toBeNull()
    })
})

describe('when the browser refuses to store the token', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        tokenStore.remove()
    })

    it('keeps the token in memory so signing in still works, and says so to subscribers', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
        const listener = vi.fn()
        const stop = tokenStore.subscribe(listener)
        expect(() => tokenStore.set('mem-token')).not.toThrow()
        expect(tokenStore.get()).toBe('mem-token')
        expect(listener).toHaveBeenCalledTimes(1)
        stop()
    })

    it('keeps it when reading is blocked as well, and removes it again', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('SecurityError') })
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError') })
        tokenStore.set('mem-token')
        expect(tokenStore.get()).toBe('mem-token')
        tokenStore.remove()
        expect(tokenStore.get()).toBeNull()
    })

    it('does not leave the previous value in storage when the new one cannot be written', () => {
        tokenStore.set('first')
        expect(localStorage.getItem('token')).toBe('first')
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
        tokenStore.set('second')
        // Another tab or a reload must not pick up the old account's token
        expect(localStorage.getItem('token')).toBeNull()
        expect(tokenStore.get()).toBe('second')
    })

    it('goes back to the stored value once storage works again', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
        tokenStore.set('mem-token')
        spy.mockRestore()
        tokenStore.set('stored-token')
        expect(localStorage.getItem('token')).toBe('stored-token')
        localStorage.setItem('token', 'changed-in-another-tab')
        expect(tokenStore.get()).toBe('changed-in-another-tab')
    })
})
