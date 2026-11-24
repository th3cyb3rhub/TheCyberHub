import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchApi = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ fetchApi }))

import * as api from '../resources'

beforeEach(() => {
    fetchApi.mockReset()
    fetchApi.mockResolvedValue({ success: true, data: { ok: 1 } })
})

describe('resource query', () => {
    it('is empty for the defaults', () => {
        expect(api.resourceQuery({})).toBe('')
        expect(api.resourceQuery({ q: ' ', page: 1 })).toBe('')
    })
    it('writes the facets and the search', () => {
        const p = new URLSearchParams(api.resourceQuery({ q: ' sqli ', type: 'video', topic: 'web-security', difficulty: 'beginner', isFree: true, tag: 'burp', sort: 'new', page: 3, limit: 12 }))
        expect(Object.fromEntries(p)).toEqual({ q: 'sqli', type: 'video', topic: 'web-security', difficulty: 'beginner', isFree: 'true', tag: 'burp', sort: 'new', page: '3', limit: '12' })
    })
})

describe('reads', () => {
    it('lists and loads one', async () => {
        await api.listResources({ type: 'book' })
        await api.getResource('owasp top 10')
        expect(fetchApi).toHaveBeenNthCalledWith(1, '/api/resources?type=book')
        expect(fetchApi).toHaveBeenNthCalledWith(2, '/api/resources/owasp%20top%2010')
    })
    it('loads the facets without a token', async () => {
        await api.getFacets()
        expect(fetchApi).toHaveBeenCalledWith('/api/resources/facets', { requireAuth: false })
    })
    it('encodes the link of a duplicate check', async () => {
        await api.checkUrl('https://a.org/x?y=1&z=2')
        expect(fetchApi).toHaveBeenCalledWith('/api/resources/check-url?url=https%3A%2F%2Fa.org%2Fx%3Fy%3D1%26z%3D2')
    })
    it('reads own submissions and the reading list', async () => {
        await api.listMySubmissions({ status: 'pending' })
        await api.listReading({ status: 'to-read' })
        expect(fetchApi.mock.calls.map((c) => c[0])).toEqual(['/api/resources/my?status=pending', '/api/resources/reading?status=to-read'])
    })
    it('omits the queue parameter for the default queue', async () => {
        await api.listReviewQueue({ queue: 'pending' })
        await api.listReviewQueue({ queue: 'reported', q: ' x ' })
        expect(fetchApi.mock.calls.map((c) => c[0])).toEqual(['/api/resources/review', '/api/resources/review?queue=reported&q=x'])
    })
})

describe('writes', () => {
    it('votes with the value', async () => {
        await api.voteResource('a', -1)
        expect(fetchApi).toHaveBeenCalledWith('/api/resources/a/vote', { method: 'POST', body: JSON.stringify({ value: -1 }) })
    })
    it('reports with trimmed details', async () => {
        await api.reportResource('a', { reason: 'spam', details: '  ' })
        expect(fetchApi).toHaveBeenCalledWith('/api/resources/a/report', { method: 'POST', body: JSON.stringify({ reason: 'spam' }) })
    })
    it('sets and clears the reading status', async () => {
        await api.setReading('a', 'reading')
        await api.setReading('a', null)
        expect(fetchApi).toHaveBeenNthCalledWith(1, '/api/resources/a/reading', { method: 'PUT', body: JSON.stringify({ status: 'reading' }) })
        expect(fetchApi).toHaveBeenNthCalledWith(2, '/api/resources/a/reading', { method: 'DELETE' })
    })
    it('moderates', async () => {
        await api.approveResource('a')
        await api.rejectResource('a', { reason: 'duplicate', note: ' same ' })
        await api.setLinkStatus('a', { status: 'broken', note: '404' })
        await api.featureResource('a', true)
        expect(fetchApi.mock.calls.map((c) => [c[0], c[1].method, c[1].body])).toEqual([
            ['/api/resources/a/approve', 'PATCH', undefined],
            ['/api/resources/a/reject', 'PATCH', JSON.stringify({ reason: 'duplicate', note: 'same' })],
            ['/api/resources/a/link-status', 'PATCH', JSON.stringify({ status: 'broken', note: '404' })],
            ['/api/resources/a/feature', 'PATCH', JSON.stringify({ featured: true })],
        ])
    })
    it('creates, updates and deletes', async () => {
        await api.createResource({ title: 'T' } as never)
        await api.updateResource('a', { title: 'U' } as never)
        await api.deleteResource('a')
        expect(fetchApi.mock.calls.map((c) => [c[0], c[1].method])).toEqual([['/api/resources', 'POST'], ['/api/resources/a', 'PUT'], ['/api/resources/a', 'DELETE']])
    })
})
