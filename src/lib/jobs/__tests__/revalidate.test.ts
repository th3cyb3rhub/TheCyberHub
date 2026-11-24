import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ token: null as string | null }))
vi.mock('@/lib/api', () => ({ tokenStore: { get: () => store.token } }))

import { refreshPublicJobs } from '../revalidate'

beforeEach(() => { store.token = null })
afterEach(() => vi.unstubAllGlobals())

describe('refreshPublicJobs', () => {
    it('sends nothing without a session', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        await refreshPublicJobs()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('calls the purge route with the token of the signed-in reviewer', async () => {
        store.token = 'tok123456789'
        const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
        vi.stubGlobal('fetch', fetchMock)
        await refreshPublicJobs()
        expect(fetchMock).toHaveBeenCalledWith('/api/revalidate/jobs', expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer tok123456789' } }))
    })

    it('never throws when the purge fails', async () => {
        store.token = 'tok123456789'
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
        await expect(refreshPublicJobs()).resolves.toBeUndefined()
    })
})
