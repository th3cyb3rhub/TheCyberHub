import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeResource } from '@/lib/learning/__tests__/fixtures'
import type { Resource } from '@/types/resource'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }), usePathname: () => '/resources/owasp-top-10', useSearchParams: () => new URLSearchParams() }))
const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))

const query = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const vote = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const bookmark = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const idle = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }))
vi.mock('@/hooks/queries/useResources', () => ({
    useResource: () => query.current, useVoteResource: () => vote, useBookmarkResource: () => bookmark, useSetReading: () => idle,
    useDeleteResource: () => idle, useReportResource: () => idle,
}))

import { ResourceDetailView } from '../ResourceDetailView'

const viewer = (over = {}) => ({ vote: 0 as const, bookmarked: false, reading: null, isOwner: false, canEdit: false, canDelete: false, canModerate: false, ...over })
const ok = (data?: Resource, extra = {}) => ({ data, isError: false, error: null, refetch: vi.fn(), ...extra })

beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({ user: { id: 'u1', username: 'ada', role: 'user' }, loading: false })
    query.current = ok(makeResource({ viewer: viewer() }))
})

describe('states', () => {
    it('shows a skeleton, a not-found page and a retryable error', () => {
        query.current = ok(undefined)
        const { unmount, container } = render(<ResourceDetailView slug="x" />)
        expect(container.querySelector('[aria-busy], [role="status"]')).not.toBeNull()
        unmount()
        query.current = ok(undefined, { isError: true, error: new ApiError('nf', 404, 'RESOURCE_NOT_FOUND') })
        const second = render(<ResourceDetailView slug="x" />)
        expect(screen.getByText('Resource not found')).toBeInTheDocument()
        second.unmount()
        const refetch = vi.fn()
        query.current = ok(undefined, { isError: true, error: new ApiError('down', 500), refetch })
        render(<ResourceDetailView slug="x" />)
        fireEvent.click(screen.getByRole('button', { name: /try again/i }))
        expect(refetch).toHaveBeenCalled()
    })
})

describe('the link', () => {
    it('opens a web link in a new tab with a safe rel', () => {
        render(<ResourceDetailView slug="owasp-top-10" />)
        const a = screen.getByTestId('visit')
        expect(a).toHaveAttribute('href', 'https://owasp.org/Top10')
        expect(a).toHaveAttribute('target', '_blank')
        expect(a.getAttribute('rel')).toMatch(/noopener/)
        expect(a.getAttribute('rel')).toMatch(/noreferrer/)
    })
    it('never renders a javascript link as a link', () => {
        query.current = ok(makeResource({ url: 'javascript:alert(1)', viewer: viewer() }))
        const { container } = render(<ResourceDetailView slug="x" />)
        expect(container.querySelector('a[href^="javascript"]')).toBeNull()
        expect(screen.queryByTestId('visit')).toBeNull()
        expect(screen.getByText(/not a web address/)).toBeInTheDocument()
    })
    it('renders hostile text as text', () => {
        query.current = ok(makeResource({ title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>', viewer: viewer() }))
        const { container } = render(<ResourceDetailView slug="x" />)
        expect(container.querySelector('img')).toBeNull()
        expect(container.querySelector('script')).toBeNull()
        expect(screen.getByTestId('description')).toHaveTextContent('<script>alert(1)</script>')
    })
})

describe('viewer driven controls', () => {
    it('lets a member vote, taking a vote back with a second click', () => {
        const { unmount } = render(<ResourceDetailView slug="owasp-top-10" />)
        fireEvent.click(screen.getByRole('button', { name: /Upvote/ }))
        expect(vote.mutate).toHaveBeenCalledWith({ id: 'r1', slug: 'owasp-top-10', value: 1 })
        unmount()
        query.current = ok(makeResource({ viewer: viewer({ vote: 1 }) }))
        render(<ResourceDetailView slug="owasp-top-10" />)
        fireEvent.click(screen.getByRole('button', { name: /Upvote/ }))
        expect(vote.mutate).toHaveBeenLastCalledWith({ id: 'r1', slug: 'owasp-top-10', value: 0 })
    })
    it('disables voting and reporting on your own submission', () => {
        query.current = ok(makeResource({ viewer: viewer({ isOwner: true, canEdit: true, canDelete: true }) }))
        render(<ResourceDetailView slug="owasp-top-10" />)
        expect(screen.getByRole('button', { name: /Upvote/ })).toBeDisabled()
        expect(screen.getByRole('button', { name: /Downvote/ })).toBeDisabled()
        expect(screen.queryByRole('button', { name: /Report/ })).toBeNull()
        expect(screen.getByRole('link', { name: /Edit/ })).toHaveAttribute('href', '/resources/owasp-top-10/edit')
        expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument()
    })
    it('sends a visitor to sign in instead of voting', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        query.current = ok(makeResource({ viewer: null }))
        render(<ResourceDetailView slug="owasp-top-10" />)
        expect(screen.getByRole('button', { name: 'Sign in to vote and save' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Report/ })).toBeNull()
        expect(screen.queryByLabelText(/Reading status/i)).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /Upvote/ }))
        expect(vote.mutate).not.toHaveBeenCalled()
    })
    it('bookmarks and shows the moderator link only with the matching flags', () => {
        const { unmount } = render(<ResourceDetailView slug="owasp-top-10" />)
        expect(screen.queryByRole('link', { name: /Review queue/ })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /bookmark/i }))
        expect(bookmark.mutate).toHaveBeenCalledWith({ id: 'r1', bookmarked: true })
        unmount()
        query.current = ok(makeResource({ viewer: viewer({ canModerate: true }) }))
        render(<ResourceDetailView slug="owasp-top-10" />)
        expect(screen.getByRole('link', { name: /Review queue/ })).toHaveAttribute('href', '/admin/resources')
    })
    it('opens the report dialog and requires a reason', () => {
        render(<ResourceDetailView slug="owasp-top-10" />)
        fireEvent.click(screen.getByRole('button', { name: /Report/ }))
        expect(screen.getByText('Report this resource')).toBeInTheDocument()
    })
})

describe('status and used-in', () => {
    it('explains a pending and a rejected submission with the moderator reason', () => {
        query.current = ok(makeResource({ status: 'pending', viewer: viewer({ isOwner: true, canEdit: true }) }))
        const { unmount } = render(<ResourceDetailView slug="x" />)
        expect(screen.getByRole('note')).toHaveTextContent('waiting for review')
        expect(screen.queryByTestId('votes')).toBeNull()
        unmount()
        query.current = ok(makeResource({ status: 'rejected', rejectionCode: 'duplicate', rejectionReason: 'Same as the OWASP page', viewer: viewer({ isOwner: true, canEdit: true }) }))
        render(<ResourceDetailView slug="x" />)
        expect(screen.getByTestId('rejection')).toHaveTextContent('Same as the OWASP page')
        for (const link of screen.getAllByRole('link', { name: /Edit and resubmit/ })) expect(link).toHaveAttribute('href', '/resources/owasp-top-10/edit')
    })
    it('links to the roadmaps and paths that use it', () => {
        query.current = ok(makeResource({ viewer: viewer(), usedIn: [{ id: 'p1', slug: 'web-hacking', title: 'Web hacking', kind: 'roadmap' }, { id: 'p2', slug: 'linux', title: 'Linux', kind: 'path' }] }))
        render(<ResourceDetailView slug="x" />)
        expect(screen.getByRole('link', { name: 'Web hacking' })).toHaveAttribute('href', '/roadmaps/web-hacking')
        expect(screen.getByRole('link', { name: 'Linux' })).toHaveAttribute('href', '/learning-paths/linux')
    })
})
