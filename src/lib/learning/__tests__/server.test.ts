import { describe, it, expect, vi, beforeEach } from 'vitest'

// React's cache() only memoises inside a server render; here it records that it wraps the function
const cacheSpy = vi.hoisted(() => vi.fn(<T extends (...a: never[]) => unknown>(fn: T) => fn))
vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), cache: cacheSpy }))

import { fetchCertificate } from '../server'

const respond = (status: number, body: unknown = {}) => vi.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body })

beforeEach(() => { vi.unstubAllGlobals() })

describe('fetchCertificate', () => {
    it('is wrapped in cache() so the page and its metadata share one request', () => {
        expect(cacheSpy).toHaveBeenCalledTimes(1)
    })
    it('treats 404 and 400 as missing, other failures as errors', async () => {
        vi.stubGlobal('fetch', respond(404))
        await expect(fetchCertificate('a')).resolves.toEqual({ state: 'missing' })
        vi.stubGlobal('fetch', respond(400))
        await expect(fetchCertificate('%%')).resolves.toEqual({ state: 'missing' })
        vi.stubGlobal('fetch', respond(503))
        await expect(fetchCertificate('a')).resolves.toEqual({ state: 'error' })
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
        await expect(fetchCertificate('a')).resolves.toEqual({ state: 'error' })
    })
    it('returns the certificate and never stores the answer', async () => {
        const fetchMock = respond(200, { data: { certificateId: 'CH-1', recipient: { username: 'ada' }, path: { title: 'T' }, completedAt: 'x', selfPaced: true } })
        vi.stubGlobal('fetch', fetchMock)
        await expect(fetchCertificate('CH-1')).resolves.toMatchObject({ state: 'ok', data: { certificateId: 'CH-1' } })
        expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/certificates\/CH-1$/)
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
    })
})
