import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchApi = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ fetchApi }))

import * as api from '../learning'

beforeEach(() => {
    fetchApi.mockReset()
    fetchApi.mockResolvedValue({ success: true, data: { ok: 1 } })
})

describe('catalogue query', () => {
    it('is empty for the defaults', () => {
        expect(api.catalogueQuery({})).toBe('')
        expect(api.catalogueQuery({ page: 1, sort: 'popular', search: '  ', category: '' })).toBe('')
    })
    it('writes only what is set', () => {
        const p = new URLSearchParams(api.catalogueQuery({ kind: 'roadmap', category: 'web-security', difficulty: 'beginner', search: ' xss ', sort: 'new', featured: true, page: 2, limit: 12 }))
        expect(Object.fromEntries(p)).toEqual({ kind: 'roadmap', category: 'web-security', difficulty: 'beginner', search: 'xss', sort: 'new', featured: 'true', page: '2', limit: '12' })
    })
})

describe('reads', () => {
    it('lists the catalogue with the token', async () => {
        await api.listPaths({ kind: 'path' })
        expect(fetchApi).toHaveBeenCalledWith('/api/learning-paths?kind=path')
    })
    it('loads a path by slug or id, encoded', async () => {
        await expect(api.getPath('web hacking')).resolves.toEqual({ ok: 1 })
        expect(fetchApi).toHaveBeenCalledWith('/api/learning-paths/web%20hacking')
    })
    it('reads the summary, progress and next step', async () => {
        await api.getSummary()
        await api.listMyProgress()
        await api.getNextNode('web')
        expect(fetchApi.mock.calls.map((c) => c[0])).toEqual(['/api/learning-paths/user/summary', '/api/learning-paths/user/progress', '/api/learning-paths/web/next'])
    })
    it('verifies a certificate without sending the token', async () => {
        await api.verifyCertificate('CH-ABC 1')
        expect(fetchApi).toHaveBeenCalledWith('/api/certificates/CH-ABC%201', { requireAuth: false })
    })
    it('reads the own certificate of a path', async () => {
        await api.getMyCertificate('web')
        expect(fetchApi).toHaveBeenCalledWith('/api/learning-paths/web/certificate')
    })
})

describe('progress writes', () => {
    it('enrolls', async () => {
        await api.enrollInPath('web')
        expect(fetchApi).toHaveBeenCalledWith('/api/learning-paths/web/enroll', { method: 'POST' })
    })
    it('completes and uncompletes a step', async () => {
        await api.completeNode('web', 'n1')
        await api.uncompleteNode('web', 'n1')
        expect(fetchApi).toHaveBeenNthCalledWith(1, '/api/learning-paths/web/modules/n1/complete', { method: 'POST' })
        expect(fetchApi).toHaveBeenNthCalledWith(2, '/api/learning-paths/web/modules/n1/uncomplete', { method: 'POST' })
    })
    it('bookmarks through the shared routes as a roadmap', async () => {
        await api.addBookmark('roadmap', 'p1')
        await api.removeBookmark('roadmap', 'p1')
        expect(fetchApi).toHaveBeenNthCalledWith(1, '/api/bookmarks', { method: 'POST', body: JSON.stringify({ contentType: 'roadmap', contentId: 'p1' }) })
        expect(fetchApi).toHaveBeenNthCalledWith(2, '/api/bookmarks/roadmap/p1', { method: 'DELETE' })
    })
})

describe('authoring', () => {
    it('lists drafts with filters', async () => {
        await api.listAdminPaths({ status: 'draft', kind: 'roadmap', q: ' web ', page: 2, limit: 20 })
        const url = String(fetchApi.mock.calls[0][0])
        expect(url.startsWith('/api/learning-paths/admin/list?')).toBe(true)
        expect(Object.fromEntries(new URLSearchParams(url.split('?')[1]))).toEqual({ status: 'draft', kind: 'roadmap', q: 'web', page: '2', limit: '20' })
    })
    it('loads the editor copy', async () => {
        await api.getEditorPath('p1')
        expect(fetchApi).toHaveBeenCalledWith('/api/learning-paths/admin/p1')
    })
    it('sends the version guard with a save', async () => {
        await api.updatePath('web', { title: 'Web', ifUnmodifiedSince: '2026-11-01T10:00:00Z' })
        expect(fetchApi).toHaveBeenCalledWith('/api/learning-paths/web', { method: 'PUT', body: JSON.stringify({ title: 'Web', ifUnmodifiedSince: '2026-11-01T10:00:00Z' }) })
    })
    it('creates, transitions, requests changes, features and deletes', async () => {
        await api.createPath({ title: 'New' })
        await api.transitionPath('web', 'publish')
        await api.transitionPath('web', 'restore')
        await api.requestPathChanges('web', 'Add sources')
        await api.featurePath('web', true)
        await api.deletePath('web')
        expect(fetchApi.mock.calls.map((c) => [c[0], c[1].method])).toEqual([
            ['/api/learning-paths', 'POST'], ['/api/learning-paths/web/publish', 'POST'], ['/api/learning-paths/web/restore', 'POST'],
            ['/api/learning-paths/web/request-changes', 'POST'], ['/api/learning-paths/web/feature', 'PATCH'], ['/api/learning-paths/web', 'DELETE'],
        ])
        expect(fetchApi.mock.calls[3][1].body).toBe(JSON.stringify({ note: 'Add sources' }))
        expect(fetchApi.mock.calls[4][1].body).toBe(JSON.stringify({ featured: true }))
    })
})
