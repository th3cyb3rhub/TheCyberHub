import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ permanentRedirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT:${to}`) }), notFound: vi.fn(), redirect: vi.fn() }))
vi.mock('next/navigation', () => nav)
const server = vi.hoisted(() => ({ fetchPublicPath: vi.fn() }))
vi.mock('@/lib/learning/server', async (orig) => ({ ...(await orig<typeof import('@/lib/learning/server')>()), ...server }))
vi.mock('../LearningPathView', () => ({ LearningPathView: ({ slug, kind }: { slug: string; kind: string }) => <div data-testid="view" data-slug={slug} data-kind={kind} /> }))
vi.mock('@/components/StructuredData', () => ({ default: () => null }))

import { PathPage } from '../PathPage'

const ok = (data: Record<string, unknown>) => ({ state: 'ok', data: { title: 'Web basics', description: 'd', slug: 'web-basics', ...data } })
const attempt = async (fn: () => Promise<unknown>) => { try { return await fn() } catch (e) { return e as Error } }

beforeEach(() => vi.clearAllMocks())

describe('PathPage', () => {
    it('renders a path under its own address', async () => {
        server.fetchPublicPath.mockResolvedValue(ok({ kind: 'roadmap' }))
        const html = renderToStaticMarkup((await PathPage({ kind: 'roadmap', slug: 'web-basics' })) as React.ReactElement)
        expect(html).toContain('data-kind="roadmap"')
        expect(nav.permanentRedirect).not.toHaveBeenCalled()
    })

    it('moves a roadmap opened as a learning path with a 308, to the encoded address', async () => {
        server.fetchPublicPath.mockResolvedValue(ok({ kind: 'roadmap', slug: 'web basics' }))
        const error = await attempt(() => PathPage({ kind: 'path', slug: 'web-basics' }))
        expect((error as Error).message).toBe('NEXT_REDIRECT:/roadmaps/web%20basics')
    })

    it.each([
        ['a kind that is not one', { kind: '../admin', slug: 'web-basics' }],
        ['an empty slug', { kind: 'roadmap', slug: '' }],
        ['no slug', { kind: 'roadmap', slug: undefined }],
        ['a slug with a line break', { kind: 'roadmap', slug: 'a\nb' }],
    ])('renders in place, with no redirect, for %s', async (_name, data) => {
        server.fetchPublicPath.mockResolvedValue(ok(data))
        const html = renderToStaticMarkup((await PathPage({ kind: 'path', slug: 'web-basics' })) as React.ReactElement)
        expect(html).toContain('data-testid="view"')
        expect(nav.permanentRedirect).not.toHaveBeenCalled()
    })

    it('does not move a path that already is of the kind asked for, even if its slug differs (no loop)', async () => {
        server.fetchPublicPath.mockResolvedValue(ok({ kind: 'path', slug: 'other-slug' }))
        await PathPage({ kind: 'path', slug: 'web-basics' })
        expect(nav.permanentRedirect).not.toHaveBeenCalled()
    })
})
