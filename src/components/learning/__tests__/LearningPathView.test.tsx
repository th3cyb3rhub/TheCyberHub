import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeDetail, node, progress, viewer } from '@/lib/learning/__tests__/fixtures'
import type { LearningDetail } from '@/types/learning'

const replace = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }), usePathname: () => '/roadmaps/web-hacking', useSearchParams: () => new URLSearchParams() }))
const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

const query = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const tick = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const enroll = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const bookmark = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useLearningPaths', () => ({
    useLearningPath: () => query.current,
    useTickNode: () => tick,
    useEnroll: () => enroll,
    useBookmarkPath: () => bookmark,
}))
vi.mock('@/lib/api/learning', () => ({ getMyCertificate: vi.fn() }))

import { LearningPathView } from '../LearningPathView'

const ok = (data: LearningDetail | undefined, extra = {}) => ({ data, isError: false, error: null, refetch: vi.fn(), ...extra })

beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({ user: { id: 'u1', role: 'user', username: 'ada' }, loading: false })
    query.current = ok(makeDetail())
})

describe('states of the page', () => {
    it('shows a skeleton while loading', () => {
        query.current = ok(undefined)
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    })
    it('explains a missing roadmap and links back to the list', () => {
        query.current = ok(undefined, { isError: true, error: new ApiError('gone', 404, 'PATH_NOT_FOUND') })
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByText('This roadmap is not available')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Browse roadmaps' })).toHaveAttribute('href', '/roadmaps')
    })
    it('shows an error with a retry for other failures', () => {
        const refetch = vi.fn()
        query.current = ok(undefined, { isError: true, error: new ApiError('down', 500), refetch })
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        fireEvent.click(screen.getByRole('button', { name: /try again/i }))
        expect(refetch).toHaveBeenCalled()
    })
    it('moves a roadmap opened under the learning-paths address to its own page', () => {
        render(<LearningPathView slug="web-hacking" kind="path" />)
        expect(replace).toHaveBeenCalledWith('/roadmaps/web-hacking')
    })
})

describe('viewer driven controls', () => {
    it('asks a visitor to sign in and sends the tick to sign in', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        query.current = ok(makeDetail({ viewer: null }))
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByRole('link', { name: 'Sign in to track progress' })).toHaveAttribute('href', expect.stringContaining('/auth'))
        fireEvent.click(screen.getByRole('button', { name: /Mark step 1 complete/ }))
        expect(tick.mutate).not.toHaveBeenCalled()
        expect(push).toHaveBeenCalledWith(expect.stringContaining('/auth'))
        expect(screen.queryByRole('button', { name: /bookmark/i })).toBeNull()
    })
    it('does not offer "Start" while the member\'s own state is still loading', () => {
        query.current = ok(makeDetail({ viewer: null }))
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByRole('status', { name: 'Loading your progress' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Start this roadmap/ })).toBeNull()
        expect(screen.queryByRole('link', { name: 'Sign in to track progress' })).toBeNull()
    })
    it('keeps one bookmark label and reports the state with aria-pressed', () => {
        const { unmount } = render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        const off = screen.getByRole('button', { name: 'Bookmark Web hacking' })
        expect(off).toHaveAttribute('aria-pressed', 'false')
        unmount()
        query.current = ok(makeDetail({ viewer: viewer({ bookmarked: true }) }))
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByRole('button', { name: 'Bookmark Web hacking' })).toHaveAttribute('aria-pressed', 'true')
    })
    it('offers to start when signed in but not enrolled', () => {
        query.current = ok(makeDetail({ viewer: viewer({ enrolled: false, progress: null, next: node({ id: 'a', title: 'HTTP basics' }) }) }))
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        fireEvent.click(screen.getByRole('button', { name: /Start this roadmap/ }))
        expect(enroll.mutate).toHaveBeenCalledWith({ slug: 'web-hacking', title: 'Web hacking' })
        expect(within(screen.getByTestId('next-card')).getByText('Where to start')).toBeInTheDocument()
    })
    it('shows the progress, the next step and ticks a step', () => {
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByTestId('progress-text')).toHaveTextContent('1 of 3 required steps · 33%')
        expect(within(screen.getByTestId('next-card')).getByText('Injection')).toBeInTheDocument()
        const done = screen.getByRole('button', { name: /Mark step 1 complete/ })
        expect(done).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(done)
        expect(tick.mutate).toHaveBeenCalledWith({ slug: 'web-hacking', nodeId: 'a', done: false, title: 'Web hacking' }, expect.any(Object))
        fireEvent.click(screen.getByRole('button', { name: /Mark step 2 complete/ }))
        expect(tick.mutate).toHaveBeenLastCalledWith({ slug: 'web-hacking', nodeId: 'b', done: true, title: 'Web hacking' }, expect.any(Object))
    })
    it('treats prerequisites as advice on a roadmap and as a requirement on a path', () => {
        const pre = [{ id: 'x', slug: 'linux', title: 'Linux basics', kind: 'path' as const, completed: false }]
        query.current = ok(makeDetail({ prerequisites: pre }))
        const { unmount } = render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByText('Recommended first')).toBeInTheDocument()
        expect(screen.getByText(/This is advice/)).toBeInTheDocument()
        unmount()
        query.current = ok(makeDetail({ kind: 'path', prerequisites: pre, viewer: viewer({ enrolled: false, progress: null, next: null }) }))
        render(<LearningPathView slug="web-hacking" kind="path" />)
        expect(screen.getByText('Finish these first')).toBeInTheDocument()
        expect(screen.getByText('Finish Linux basics first.')).toBeInTheDocument()
    })
    it('marks a step that waits on others as advisory, not disabled', () => {
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByText(/Better after: Injection/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Mark step 3 complete/ })).toBeEnabled()
    })
    it('shows the certificate once the roadmap is complete', () => {
        query.current = ok(makeDetail({ viewer: viewer({ progress: progress({ status: 'completed', percent: 100, completedModules: ['a', 'b', 'c'], requiredCompleted: 3 }), next: node({ id: 'd', optional: true }), certificateId: 'CH-1' }) }))
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByRole('link', { name: /Get certificate/ })).toHaveAttribute('href', '/certificates/CH-1')
        expect(screen.queryByTestId('next-card')).toBeNull()
    })
    it('shows the edit link only to people who can edit', () => {
        const { unmount } = render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.queryByRole('link', { name: /Edit/ })).toBeNull()
        unmount()
        query.current = ok(makeDetail({ viewer: viewer({ canEdit: true }) }))
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByRole('link', { name: /Edit/ })).toHaveAttribute('href', '/admin/learning-paths/p1')
    })
    it('notes a draft that only staff can see and a retired roadmap', () => {
        query.current = ok(makeDetail({ status: 'draft', reviewNote: 'Add sources' } as Partial<LearningDetail>))
        const { unmount } = render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByRole('note')).toHaveTextContent(/draft and only staff can see it.*Add sources/)
        unmount()
        query.current = ok(makeDetail({ archived: true }))
        render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(screen.getByRole('note')).toHaveTextContent('has been retired')
    })
})

describe('untrusted content', () => {
    it('renders text as text and links only http(s)', () => {
        const evil = makeDetail({ title: '<img src=x onerror=alert(1)>', modules: [node({ id: 'a', key: 'a', title: '<b>bold</b>', items: [
            { kind: 'external', ref: 'x', title: 'Bad', optional: false, href: 'javascript:alert(1)', external: true },
            { kind: 'external', ref: 'y', title: 'Good', optional: false, href: 'https://owasp.org/x', external: true },
        ] })], stages: [{ title: '', moduleIds: ['a'] }], viewer: null })
        query.current = ok(evil)
        const { container } = render(<LearningPathView slug="web-hacking" kind="roadmap" />)
        expect(container.querySelector('img')).toBeNull()
        expect(container.querySelector('b')).toBeNull()
        expect(container.querySelector('a[href^="javascript"]')).toBeNull()
        const good = container.querySelector('a[href="https://owasp.org/x"]')
        expect(good).not.toBeNull()
        expect(good?.getAttribute('rel')).toContain('noopener')
        expect(screen.getByText('Bad')).toBeInTheDocument()
    })
})
