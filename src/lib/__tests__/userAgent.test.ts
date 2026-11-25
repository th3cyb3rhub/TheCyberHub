import { describe, it, expect } from 'vitest'
import { describeDevice, timeAgo } from '../userAgent'

const UA = {
    chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1',
}

describe('describeDevice', () => {
    it.each([
        [UA.chromeMac, 'Chrome on macOS', false],
        [UA.edgeWin, 'Edge on Windows', false],
        [UA.firefoxLinux, 'Firefox on Linux', false],
        [UA.safariIphone, 'Safari on iOS', true],
        [UA.chromeAndroid, 'Chrome on Android', true],
        [UA.chromeIos, 'Chrome on iOS', true],
    ])('names %#', (ua, label, mobile) => {
        expect(describeDevice(ua)).toEqual({ label, mobile })
    })

    it('handles a client that is not a browser, or has no user agent', () => {
        expect(describeDevice('curl/8.4.0').label).toBe('Unknown device')
        expect(describeDevice('')).toEqual({ label: 'Unknown device', mobile: false })
        expect(describeDevice(null).label).toBe('Unknown device')
        expect(describeDevice('Dalvik/2.1.0 (Linux; U; Android 13)').label).toBe('Unknown browser on Android')
    })
})

describe('timeAgo', () => {
    const now = Date.parse('2026-11-25T12:00:00Z')
    it.each([
        ['2026-11-25T11:59:40Z', 'just now'],
        ['2026-11-25T11:55:00Z', '5 minutes ago'],
        ['2026-11-25T09:00:00Z', '3 hours ago'],
        ['2026-11-24T09:00:00Z', 'yesterday'],
        ['2026-09-01T09:00:00Z', '2 months ago'],
        ['not a date', 'unknown'],
        ['2026-11-25T12:30:00Z', 'just now'],
    ])('%s -> %s', (iso, expected) => {
        expect(timeAgo(iso, now)).toBe(expected)
    })
})
