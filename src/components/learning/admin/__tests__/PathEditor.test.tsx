import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import type { EditorPath } from '@/types/learning'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))
const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))

const editor = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const transition = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const idle = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, error: null }))
const getEditorPath = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/queries/useLearningPaths', () => ({
    useEditorPath: () => editor.current,
    useUpdatePath: () => update, useCreatePath: () => create, usePathTransition: () => transition,
    useRequestPathChanges: () => idle, useFeaturePath: () => idle, useDeletePath: () => idle,
    useLearningPaths: () => ({ data: { data: [] } }),
}))
vi.mock('@/lib/api/learning', () => ({ getEditorPath }))
vi.mock('@/hooks/queries/useResources', () => ({ useResourceList: () => ({ data: undefined, isLoading: false }) }))

import { PathEditor } from '../PathEditor'

const path = (over: Partial<EditorPath> = {}): EditorPath => ({
    id: 'p1', slug: 'web-hacking', title: 'Web hacking', kind: 'roadmap', shortDescription: 'From HTTP to exploits', description: 'A roadmap for web hackers.',
    category: 'offensive', difficulty: 'beginner', estimatedDuration: '6 weeks', skills: ['http'], moduleCount: 1, requiredCount: 1, enrollmentCount: 0, completionCount: 0,
    isFeatured: false, publishedAt: null, status: 'draft', createdBy: { id: 'm1', username: 'mod' }, prerequisites: [], seo: {}, reviewedAt: null, stages: [], updatedAt: '2026-11-01T10:00:00Z',
    modules: [{ id: 'n1', key: 'basics', title: 'HTTP basics', description: '', stage: 'Basics', duration: '', optional: false, requires: [], items: [] }], ...over,
} as EditorPath)
const title = () => screen.getAllByLabelText('Title')[0] as HTMLInputElement
const loaded = (data?: EditorPath, extra = {}) => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn(), ...extra })

beforeEach(() => {
    vi.clearAllMocks()
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
    useAuth.mockReturnValue({ user: { id: 'm1', role: 'admin' }, loading: false })
    editor.current = loaded(path())
})

describe('access', () => {
    it('sends a signed-out visitor to sign in and back', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        render(<PathEditor pathRef="p1" />)
        expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Fadmin%2Flearning-paths%2Fp1')
        expect(screen.queryByRole('form', { name: 'Roadmap editor' })).toBeNull()
    })
    it('keeps ordinary members out', () => {
        useAuth.mockReturnValue({ user: { id: 'u', role: 'user' }, loading: false })
        render(<PathEditor pathRef="p1" />)
        expect(screen.getByText('You cannot open this page')).toBeInTheDocument()
    })
    it('shows an error with a retry when the path cannot load', () => {
        const refetch = vi.fn()
        editor.current = loaded(undefined, { isError: true, error: new ApiError('down', 500), refetch })
        render(<PathEditor pathRef="p1" />)
        fireEvent.click(screen.getByRole('button', { name: /try again/i }))
        expect(refetch).toHaveBeenCalled()
    })
})

describe('permissions follow the role and the status', () => {
    it('lets a moderator submit a draft but not publish it', () => {
        useAuth.mockReturnValue({ user: { id: 'm1', role: 'moderator' }, loading: false })
        render(<PathEditor pathRef="p1" />)
        expect(screen.getByRole('button', { name: /Submit for review/ })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Publish/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
    })
    it('lets an admin publish and archive a draft, with no feature control until it is live', () => {
        render(<PathEditor pathRef="p1" />)
        expect(screen.getByRole('button', { name: /^Publish/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Archive/ })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Feature/ })).toBeNull()
    })
    it('offers feature and unpublish on a published path only', () => {
        editor.current = loaded(path({ status: 'published' }))
        render(<PathEditor pathRef="p1" />)
        expect(screen.getByRole('button', { name: /^Feature/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Unpublish/ })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Publish/ })).toBeNull()
    })
    it('offers restore on an archived path and request changes while in review', () => {
        editor.current = loaded(path({ status: 'archived' }))
        const { unmount } = render(<PathEditor pathRef="p1" />)
        expect(screen.getByRole('button', { name: /Restore/ })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Archive/ })).toBeNull()
        unmount()
        editor.current = loaded(path({ status: 'in_review' }))
        render(<PathEditor pathRef="p1" />)
        expect(screen.getByRole('button', { name: /Request changes/ })).toBeInTheDocument()
    })
    it('disables the status buttons while there are unsaved changes', () => {
        render(<PathEditor pathRef="p1" />)
        fireEvent.change(title(), { target: { value: 'Web hacking 2' } })
        expect(screen.getByRole('button', { name: /^Publish/ })).toBeDisabled()
        expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    })
})

describe('who may edit', () => {
    it('makes the form read-only for a moderator who does not own the path', () => {
        useAuth.mockReturnValue({ user: { id: 'm2', role: 'moderator' }, loading: false })
        render(<PathEditor pathRef="p1" />)
        expect(screen.getByTestId('read-only')).toBeInTheDocument()
        expect(title()).toBeDisabled()
        expect(screen.queryByRole('button', { name: /Save changes/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Submit for review/ })).toBeNull()
    })
    it('makes it read-only for a moderator once the path is published', () => {
        useAuth.mockReturnValue({ user: { id: 'm1', role: 'moderator' }, loading: false })
        editor.current = loaded(path({ status: 'published' }))
        render(<PathEditor pathRef="p1" />)
        expect(screen.getByTestId('read-only')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Save changes/ })).toBeNull()
    })
    it('lets an owner moderator edit a draft and an admin edit anything', () => {
        useAuth.mockReturnValue({ user: { id: 'm1', role: 'moderator' }, loading: false })
        const { unmount } = render(<PathEditor pathRef="p1" />)
        expect(screen.queryByTestId('read-only')).toBeNull()
        expect(title()).toBeEnabled()
        unmount()
        useAuth.mockReturnValue({ user: { id: 'a1', role: 'admin' }, loading: false })
        editor.current = loaded(path({ status: 'published' }))
        render(<PathEditor pathRef="p1" />)
        expect(screen.queryByTestId('read-only')).toBeNull()
        expect(screen.getByRole('button', { name: /Save changes/ })).toBeInTheDocument()
    })
})

describe('saving', () => {
    it('sends the loaded timestamp so a newer save is not overwritten', () => {
        render(<PathEditor pathRef="p1" />)
        fireEvent.change(title(), { target: { value: 'Web hacking 2' } })
        fireEvent.click(screen.getByRole('button', { name: /Save changes/ }))
        expect(update.mutate).toHaveBeenCalledTimes(1)
        const arg = update.mutate.mock.calls[0][0]
        expect(arg.ref).toBe('p1')
        expect(arg.input).toMatchObject({ title: 'Web hacking 2', ifUnmodifiedSince: '2026-11-01T10:00:00Z' })
        expect(arg.input.modules[0]).toMatchObject({ _id: 'n1', key: 'basics' })
    })
    it('does not call the API for an invalid form', () => {
        render(<PathEditor pathRef="p1" />)
        fireEvent.change(title(), { target: { value: 'ab' } })
        fireEvent.click(screen.getByRole('button', { name: /Save changes/ }))
        expect(update.mutate).not.toHaveBeenCalled()
        expect(screen.getByTestId('editor-error')).toHaveTextContent('Fix the highlighted fields')
    })
    it('shows what the API says is missing before publishing', () => {
        transition.mutate.mockImplementation((_v, opts) => opts.onError(new ApiError('x', 422, 'PATH_NOT_PUBLISHABLE', [{ field: 'modules', message: 'Add at least one step.' }])))
        render(<PathEditor pathRef="p1" />)
        fireEvent.click(screen.getByRole('button', { name: /^Publish/ }))
        expect(screen.getByTestId('editor-error')).toHaveTextContent('not ready to publish')
        expect(screen.getByTestId('editor-error')).toHaveTextContent('modules: Add at least one step.')
    })
})

describe('an edit conflict', () => {
    const conflict = () => update.mutate.mockImplementation((_v, opts) => opts.onError(new ApiError('Conflict', 409, 'PATH_CONFLICT', undefined, { updatedAt: '2026-11-05T10:00:00Z' })))

    it('opens the conflict dialog and offers to reload', async () => {
        conflict()
        render(<PathEditor pathRef="p1" />)
        fireEvent.change(title(), { target: { value: 'My title' } })
        fireEvent.click(screen.getByRole('button', { name: /Save changes/ }))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Someone else edited this roadmap')).toBeInTheDocument()
        expect(within(dialog).getByText(/discards every change the other editor made/)).toBeInTheDocument()

        getEditorPath.mockResolvedValue(path({ title: 'Their title', updatedAt: '2026-11-05T10:00:00Z' }))
        fireEvent.click(within(dialog).getByRole('button', { name: 'Load the latest version' }))
        await waitFor(() => expect((title() as HTMLInputElement).value).toBe('Their title'))
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(screen.queryByText('Unsaved changes')).toBeNull()
    })

    it('can save over their version using the newest timestamp', async () => {
        conflict()
        render(<PathEditor pathRef="p1" />)
        fireEvent.change(title(), { target: { value: 'My title' } })
        fireEvent.click(screen.getByRole('button', { name: /Save changes/ }))
        const dialog = await screen.findByRole('dialog')
        getEditorPath.mockResolvedValue(path({ title: 'Their title', updatedAt: '2026-11-05T10:00:00Z' }))
        update.mutate.mockReset()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save my version over theirs' }))
        await waitFor(() => expect(update.mutate).toHaveBeenCalled())
        expect(update.mutate.mock.calls[0][0].input).toMatchObject({ title: 'My title', ifUnmodifiedSince: '2026-11-05T10:00:00Z' })
    })

    it('explains a missing version guard in the banner', () => {
        update.mutate.mockImplementation((_v, opts) => opts.onError(new ApiError('x', 400, 'PATH_VERSION_REQUIRED')))
        render(<PathEditor pathRef="p1" />)
        fireEvent.change(title(), { target: { value: 'My title' } })
        fireEvent.click(screen.getByRole('button', { name: /Save changes/ }))
        expect(screen.getByTestId('editor-error')).toHaveTextContent('Reload this roadmap before saving')
    })
})

describe('creating', () => {
    it('saves a new draft without a version guard', () => {
        editor.current = loaded(undefined)
        render(<PathEditor />)
        fireEvent.change(title(), { target: { value: 'New roadmap' } })
        fireEvent.change(screen.getAllByLabelText('Description')[0], { target: { value: 'A description that is long enough.' } })
        fireEvent.click(screen.getByRole('button', { name: /Save draft/ }))
        expect(create.mutate).toHaveBeenCalledTimes(1)
        expect(create.mutate.mock.calls[0][0]).not.toHaveProperty('ifUnmodifiedSince')
    })
})
