import { describe, it, expect, vi, beforeEach } from 'vitest'
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

describe('tokenUserId', () => {
    it('reads the account id from an access token', () => {
        expect(tokenUserId(jwt({ id: 'u-123', type: 'access', sid: 's' }))).toBe('u-123')
    })

    it.each([null, undefined, '', 'not-a-jwt', 'a.b.c', `x.${btoa('{"id":42}')}.y`, `x.${btoa('{}')}.y`])('gives null for %j', (token) => {
        expect(tokenUserId(token as string | null | undefined)).toBeNull()
    })
})
