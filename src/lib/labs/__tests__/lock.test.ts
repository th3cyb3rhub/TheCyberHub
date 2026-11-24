import { describe, it, expect } from 'vitest'
import { lockEndsAt, serverClock, waitSeconds, withLock } from '../lock'

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0) // the browser clock when the answer arrived
const iso = (ms: number) => new Date(ms).toISOString()

describe('waitSeconds', () => {
    it('keeps a positive number, rounded up, and refuses the rest', () => {
        expect(waitSeconds(899.2)).toBe(900)
        for (const bad of [0, -3, NaN, Infinity, null, undefined, '900']) expect(waitSeconds(bad)).toBeNull()
    })
})

describe('lockEndsAt with a skewed browser clock', () => {
    it.each([
        ['browser 20 minutes behind the server', 20 * 60_000],
        ['browser 5 minutes ahead of the server', -5 * 60_000],
        ['clocks agree', 0],
    ])('uses lockedForSeconds only (%s)', (_name, skew) => {
        // The server's instant, as the browser would see it on its own clock, is off by `skew`
        const lockedUntil = iso(NOW + 900_000 + skew)
        expect(lockEndsAt({ lockedForSeconds: 900, lockedUntil }, NOW)).toBe(NOW + 900_000)
    })

    it('never lets an absolute lockedUntil replace or extend the relative wait', () => {
        expect(lockEndsAt({ lockedForSeconds: 60, lockedUntil: iso(NOW + 3 * 3600_000) }, NOW)).toBe(NOW + 60_000)
        expect(lockEndsAt({ lockedForSeconds: 600, lockedUntil: iso(NOW - 3600_000) }, NOW)).toBe(NOW + 600_000)
    })

    it('treats null and 0 as not locked, whatever lockedUntil says', () => {
        expect(lockEndsAt({ lockedForSeconds: null, lockedUntil: iso(NOW + 900_000) }, NOW)).toBeNull()
        expect(lockEndsAt({ lockedForSeconds: 0, lockedUntil: iso(NOW + 900_000) }, NOW)).toBeNull()
    })

    it.each([20 * 60_000, -5 * 60_000])('without lockedForSeconds, counts lockedUntil against the server Date header (skew %i ms)', (skew) => {
        const serverNow = NOW + skew
        const lockedUntil = iso(serverNow + 840_000) // 14 minutes left on the server's own clock
        expect(lockEndsAt({ lockedUntil }, NOW, serverNow)).toBe(NOW + 840_000)
    })

    it('without lockedForSeconds and without a server clock, falls back to the browser clock', () => {
        expect(lockEndsAt({ lockedUntil: iso(NOW + 120_000) }, NOW)).toBe(NOW + 120_000)
        expect(lockEndsAt({ lockedUntil: iso(NOW - 1000) }, NOW)).toBeNull()
        expect(lockEndsAt({ lockedUntil: 'nonsense' }, NOW)).toBeNull()
        expect(lockEndsAt({ lockedUntil: null }, NOW)).toBeNull()
        expect(lockEndsAt({}, NOW)).toBeNull()
    })

    it('keeps a stamp it has already been given, until it passes', () => {
        expect(lockEndsAt({ lockEndsAt: NOW + 5000, lockedForSeconds: 900 }, NOW)).toBe(NOW + 5000)
        expect(lockEndsAt({ lockEndsAt: NOW - 1, lockedForSeconds: 900 }, NOW)).toBeNull()
        expect(lockEndsAt({ lockEndsAt: null, lockedForSeconds: 900 }, NOW)).toBeNull()
    })
})

describe('withLock and serverClock', () => {
    it('adds the stamp and keeps the rest', () => {
        expect(withLock({ attempts: 5, lockedForSeconds: 30, lockedUntil: null }, NOW)).toEqual({ attempts: 5, lockedForSeconds: 30, lockedUntil: null, lockEndsAt: NOW + 30_000 })
    })

    it('reads a Date header, or null', () => {
        expect(serverClock('Mon, 01 Jun 2026 12:00:00 GMT')).toBe(NOW)
        expect(serverClock(null)).toBeNull()
        expect(serverClock('not a date')).toBeNull()
    })
})
