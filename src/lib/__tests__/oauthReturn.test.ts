import { describe, it, expect, beforeEach } from 'vitest'
import { stashOAuthReturn, takeOAuthReturn } from '../oauthReturn'

describe('oauthReturn', () => {
    beforeEach(() => sessionStorage.clear())

    it('hands a same-site path over once', () => {
        stashOAuthReturn('/ctf/competitions/x?tab=team')
        expect(takeOAuthReturn()).toBe('/ctf/competitions/x?tab=team')
        expect(takeOAuthReturn()).toBeNull()
    })

    it.each(['//evil.example', '/\\evil.example', 'https://evil.example', '/auth', '/%2F/evil.example', '', null])('does not keep %j', (value) => {
        stashOAuthReturn(value)
        expect(takeOAuthReturn()).toBeNull()
    })

    it('checks again on the way out, and a new stash replaces an old one', () => {
        sessionStorage.setItem('oauthReturnTo', '//evil.example')
        expect(takeOAuthReturn()).toBeNull()
        stashOAuthReturn('/a')
        stashOAuthReturn(null)
        expect(takeOAuthReturn()).toBeNull()
    })
})
