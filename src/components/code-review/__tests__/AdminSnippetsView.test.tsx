import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeAdminSnippet, makeManageCard } from '@/lib/codeReview/__tests__/fixtures'
import type { CrManageCard } from '@/types/codeReview'

const auth = vi.hoisted(() => ({ current: { user: null as null | { role: string }, loading: false } }))
const nav = vi.hoisted(() => ({ replace: vi.fn() }))
const toast = vi.hoisted(() => ({ addToast: vi.fn() }))
const q = vi.hoisted(() => ({ managed: {} as Record<string, unknown>, admin: {} as Record<string, unknown>, params: [] as unknown[] }))
const publish = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const remove = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => toast }))
vi.mock('@/hooks/queries/useCodeReview', () => ({
    useManagedSnippets: (params: unknown) => { q.params.push(params); return q.managed },
    useAdminSnippet: () => q.admin,
    useSetPublished: () => publish,
    useDeleteSnippet: () => remove,
}))
vi.mock('../SnippetEditor', () => ({ SnippetEditor: (p: { snippet?: { title: string }; readOnly?: boolean }) => <div data-testid="editor" data-readonly={p.readOnly ? 'true' : 'false'}>{p.snippet?.title ?? 'blank'}</div> }))

import { AdminSnippetsView } from '../AdminSnippetsView'
import { EditSnippetView, NewSnippetView } from '../EditorPages'

type Handlers = { onSuccess?: () => void; onError?: (e: unknown) => void }
const rows = (items: CrManageCard[]) => ({ data: { data: items, pagination: { page: 1, limit: 20, total: items.length, pages: 1, hasMore: false } }, isLoading: false, isError: false, error: null, refetch: vi.fn() })
const signIn = (role: string) => { auth.current = { user: { role }, loading: false } }

beforeEach(() => {
    vi.clearAllMocks()
    publish.isPending = false
    remove.isPending = false
    q.params = []
    q.managed = rows([makeManageCard(), makeManageCard({ _id: 'c2', slug: 'draft-one', title: 'Draft one', isPublished: false }), makeManageCard({ _id: 'c3', slug: 'empty', title: 'No findings', isPublished: false, findingCount: 0 })])
    q.admin = { data: makeAdminSnippet(), isError: false, error: null, refetch: vi.fn() }
    signIn('admin')
})

describe('role gating', () => {
    it('sends a visitor to sign in and shows no list', () => {
        auth.current = { user: null, loading: false }
        render(<AdminSnippetsView />)
        expect(nav.replace).toHaveBeenCalledWith('/auth?redirect=%2Fadmin%2Fcode-review')
        expect(screen.queryByTestId('admin-snippet')).not.toBeInTheDocument()
    })

    it('tells a member they cannot open the page', () => {
        signIn('member')
        render(<AdminSnippetsView />)
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You cannot open this page')
        expect(screen.queryByTestId('admin-snippet')).not.toBeInTheDocument()
    })

    it('lets a moderator read the list without any write control', () => {
        signIn('moderator')
        render(<AdminSnippetsView />)
        expect(screen.getAllByTestId('admin-snippet')).toHaveLength(3)
        expect(screen.queryByRole('link', { name: /New exercise/ })).not.toBeInTheDocument()
        expect(within(screen.getByRole('list', { name: 'Exercises' })).queryByRole('button')).not.toBeInTheDocument()
        expect(screen.getAllByRole('link', { name: /Open/ })[0].getAttribute('href')).toBe('/admin/code-review/sql-injection-login/edit')
        expect(screen.getByText(/Read-only/)).toBeInTheDocument()
    })

    it.each(['admin', 'owner'])('gives %s the write controls', (role) => {
        signIn(role)
        render(<AdminSnippetsView />)
        expect(screen.getByRole('link', { name: /New exercise/ }).getAttribute('href')).toBe('/admin/code-review/new')
        expect(screen.getByRole('button', { name: /Unpublish Login check/ })).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: /Delete/ })).toHaveLength(3)
    })

    it('refuses the new page to a moderator and a member, and opens it for an admin', () => {
        signIn('moderator')
        const a = render(<NewSnippetView />)
        expect(screen.getByText(/Only administrators and owners can create exercises/)).toBeInTheDocument()
        expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
        a.unmount()
        signIn('member')
        const b = render(<NewSnippetView />)
        expect(screen.getByText(/Only staff can manage/)).toBeInTheDocument()
        b.unmount()
        signIn('admin')
        render(<NewSnippetView />)
        expect(screen.getByTestId('editor')).toHaveAttribute('data-readonly', 'false')
    })

    it('opens the editor read-only for a moderator and writable for an owner', () => {
        signIn('moderator')
        const a = render(<EditSnippetView slug="sql-injection-login" />)
        expect(screen.getByTestId('editor')).toHaveAttribute('data-readonly', 'true')
        a.unmount()
        signIn('owner')
        render(<EditSnippetView slug="sql-injection-login" />)
        expect(screen.getByTestId('editor')).toHaveAttribute('data-readonly', 'false')
    })

    it('shows an error for a failed edit load, with a clear 404', () => {
        q.admin = { data: undefined, isError: true, error: new ApiError('gone', 404, 'CR_NOT_FOUND'), refetch: vi.fn() }
        render(<EditSnippetView slug="gone" />)
        expect(screen.getByText('This exercise does not exist')).toBeInTheDocument()
        expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
    })
})

describe('the list', () => {
    it('shows state, counts and a warning for an exercise with no findings, which cannot be published', () => {
        render(<AdminSnippetsView />)
        const items = screen.getAllByTestId('admin-snippet')
        expect(items[0]).toHaveAttribute('data-published', 'true')
        expect(items[1]).toHaveAttribute('data-published', 'false')
        expect(within(items[0]).getByTestId('admin-counts')).toHaveTextContent('2 findings')
        expect(within(items[2]).getByTestId('no-finding-warning')).toBeInTheDocument()
        expect(within(items[2]).getByRole('button', { name: /^Publish/ })).toBeDisabled()
        expect(within(items[1]).getByRole('button', { name: /^Publish/ })).toBeEnabled()
    })

    it('publishes and unpublishes through the API and says so', () => {
        render(<AdminSnippetsView />)
        const items = screen.getAllByTestId('admin-snippet')
        fireEvent.click(within(items[0]).getByRole('button', { name: /Unpublish/ }))
        expect(publish.mutate).toHaveBeenCalledWith({ ref: 'sql-injection-login', published: false }, expect.any(Object))
        ;(publish.mutate.mock.calls[0][1] as Handlers).onSuccess?.()
        expect(toast.addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success', message: expect.stringContaining('unpublished') }))
        fireEvent.click(within(items[1]).getByRole('button', { name: /^Publish/ }))
        expect(publish.mutate).toHaveBeenLastCalledWith({ ref: 'draft-one', published: true }, expect.any(Object))
    })

    it('shows why a publish was refused (CR_NOT_READY)', () => {
        render(<AdminSnippetsView />)
        fireEvent.click(within(screen.getAllByTestId('admin-snippet')[1]).getByRole('button', { name: /^Publish/ }))
        act(() => (publish.mutate.mock.calls[0][1] as Handlers).onError?.(new ApiError('x', 409, 'CR_NOT_READY')))
        expect(screen.getByTestId('row-error')).toHaveTextContent(/finding/i)
    })

    it('asks before deleting and deletes only on confirm', () => {
        render(<AdminSnippetsView />)
        fireEvent.click(within(screen.getAllByTestId('admin-snippet')[0]).getByRole('button', { name: /Delete/ }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('cannot be undone')
        expect(remove.mutate).not.toHaveBeenCalled()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }))
        expect(remove.mutate).not.toHaveBeenCalled()
        fireEvent.click(within(screen.getAllByTestId('admin-snippet')[0]).getByRole('button', { name: /Delete/ }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete exercise' }))
        expect(remove.mutate).toHaveBeenCalledWith({ ref: 'sql-injection-login' }, expect.any(Object))
    })

    it('explains CR_HAS_PROGRESS on delete and offers to unpublish instead', () => {
        render(<AdminSnippetsView />)
        fireEvent.click(within(screen.getAllByTestId('admin-snippet')[0]).getByRole('button', { name: /Delete/ }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete exercise' }))
        act(() => (remove.mutate.mock.calls[0][1] as Handlers).onError?.(new ApiError('x', 409, 'CR_HAS_PROGRESS')))
        const error = screen.getByTestId('row-error')
        expect(error).toHaveTextContent(/unpublish/i)
        fireEvent.click(within(error).getByRole('button', { name: 'Unpublish it now' }))
        expect(publish.mutate).toHaveBeenCalledWith({ ref: 'sql-injection-login', published: false }, expect.any(Object))
    })

    it('filters by state through the query', () => {
        render(<AdminSnippetsView />)
        fireEvent.click(screen.getByRole('button', { name: 'Drafts' }))
        expect(q.params.at(-1)).toMatchObject({ isPublished: false, page: 1 })
        fireEvent.click(screen.getByRole('button', { name: 'Published' }))
        expect(q.params.at(-1)).toMatchObject({ isPublished: true })
    })

    describe('after the last row of a page was deleted', () => {
        const page = (n: number, items: CrManageCard[], hasMore: boolean, pages: number) => ({
            data: { data: items, pagination: { page: n, limit: 20, total: 20 + items.length, pages, hasMore } },
            isLoading: false, isError: false, isSuccess: true, isPlaceholderData: false, error: null, refetch: vi.fn(),
        })

        it('goes back a page when the page it is on is empty now', () => {
            q.managed = page(1, [makeManageCard()], true, 2)
            const view = render(<AdminSnippetsView />)
            fireEvent.click(screen.getByRole('button', { name: /Next/ }))
            expect(q.params.at(-1)).toMatchObject({ page: 2 })
            q.managed = page(2, [], false, 1)
            view.rerender(<AdminSnippetsView />)
            expect(q.params.at(-1)).toMatchObject({ page: 1 })
        })

        it('does not leave the page while the old list is only kept on screen', () => {
            q.managed = page(1, [makeManageCard()], true, 2)
            const view = render(<AdminSnippetsView />)
            fireEvent.click(screen.getByRole('button', { name: /Next/ }))
            q.managed = { ...page(2, [], false, 1), isPlaceholderData: true }
            view.rerender(<AdminSnippetsView />)
            expect(q.params.at(-1)).toMatchObject({ page: 2 })
        })
    })

    it('shows an honest error with a retry, an empty state and a skeleton', () => {
        const refetch = vi.fn()
        q.managed = { data: undefined, isLoading: false, isError: true, error: new ApiError('x', 500, 'INTERNAL'), refetch }
        const a = render(<AdminSnippetsView />)
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(refetch).toHaveBeenCalled()
        a.unmount()
        q.managed = rows([])
        const b = render(<AdminSnippetsView />)
        expect(screen.getByText('No exercises yet')).toBeInTheDocument()
        b.unmount()
        q.managed = { data: undefined, isLoading: true, isError: false, error: null, refetch }
        render(<AdminSnippetsView />)
        expect(screen.getByRole('status', { name: 'Loading exercises' })).toBeInTheDocument()
    })
})
