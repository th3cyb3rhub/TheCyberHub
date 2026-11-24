// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock('next/cache', () => cache)

import { POST } from '../route'

const TOKEN = 'Bearer abcdefghij.klmnop-qrstuv'
const call = (authorization?: string) =>
    POST(new Request('http://localhost:3000/api/revalidate/jobs', { method: 'POST', headers: authorization ? { authorization } : {} }))
const me = (status: number, role?: string) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { role } }), { status, headers: { 'content-type': 'application/json' } }))

beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})

describe('purge of the cached public jobs pages', () => {
    it('refuses a call without a usable Authorization header and asks nothing', async () => {
        const fetchMock = me(200, 'admin')
        vi.stubGlobal('fetch', fetchMock)
        expect((await call()).status).toBe(401)
        expect((await call('Basic abc')).status).toBe(401)
        expect((await call('Bearer short')).status).toBe(401)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(cache.revalidateTag).not.toHaveBeenCalled()
    })

    it('refuses a member who is not an administrator or an owner', async () => {
        vi.stubGlobal('fetch', me(200, 'user'))
        expect((await call(TOKEN)).status).toBe(403)
        expect(cache.revalidateTag).not.toHaveBeenCalled()
    })

    it('refuses a token the API does not accept', async () => {
        vi.stubGlobal('fetch', me(401))
        expect((await call(TOKEN)).status).toBe(401)
        expect(cache.revalidateTag).not.toHaveBeenCalled()
    })

    it('answers 502 and purges nothing when the API cannot be reached', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
        expect((await call(TOKEN)).status).toBe(502)
        expect(cache.revalidateTag).not.toHaveBeenCalled()
    })

    it.each(['admin', 'owner'])('purges the jobs tag for an %s, after the API confirmed the role', async (role) => {
        const fetchMock = me(200, role)
        vi.stubGlobal('fetch', fetchMock)
        const res = await call(TOKEN)
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ revalidated: true })
        expect(cache.revalidateTag).toHaveBeenCalledWith('jobs')
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(TOKEN)
    })
})
