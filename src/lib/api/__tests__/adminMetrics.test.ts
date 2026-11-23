import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchApi = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ fetchApi }))

import { getActivation } from '../adminMetrics'

beforeEach(() => { fetchApi.mockReset() })

describe('getActivation', () => {
    it('asks for the chosen number of weeks', async () => {
        fetchApi.mockResolvedValue({ success: true, data: { weeks: [{ week: '2026-W42', signups: 3 }] } })
        const res = await getActivation(8)
        expect(fetchApi).toHaveBeenCalledWith('/api/admin/metrics/activation?weeks=8')
        expect(res.weeks).toHaveLength(1)
    })

    it('treats a missing list as empty', async () => {
        fetchApi.mockResolvedValue({ success: true, data: {} })
        expect((await getActivation(4)).weeks).toEqual([])
    })
})
