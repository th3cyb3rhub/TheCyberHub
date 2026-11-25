import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { CODE, makeAdminSnippet } from '@/lib/codeReview/__tests__/fixtures'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
const toast = vi.hoisted(() => ({ addToast: vi.fn() }))
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const remove = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const publish = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn() }) }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => toast }))
vi.mock('@/hooks/queries/useCodeReview', () => ({ useCreateSnippet: () => create, useUpdateSnippet: () => update, useDeleteSnippet: () => remove, useSetPublished: () => publish }))

import { SnippetEditor } from '../SnippetEditor'

type Handlers = { onSuccess?: () => void; onError?: (e: unknown) => void }
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const row = (n: number) => screen.getAllByTestId('finding-row')[n]

const fillBasics = () => {
    type(/^Title/, 'Login check')
    type(/^Description/, 'Review this login function.')
    type(/^Vulnerable code/, CODE)
}
const addFinding = (start: string, end: string, explanation = 'The name is concatenated into the query.') => {
    fireEvent.click(screen.getByRole('button', { name: /Add a finding/ }))
    const n = screen.getAllByTestId('finding-row').length - 1
    const r = within(row(n))
    fireEvent.change(r.getByLabelText(new RegExp(`Finding ${n + 1} first line`)), { target: { value: start } })
    fireEvent.change(r.getByLabelText(new RegExp(`Finding ${n + 1} last line`)), { target: { value: end } })
    fireEvent.change(r.getByLabelText(new RegExp(`Finding ${n + 1} explanation`)), { target: { value: explanation } })
}

beforeEach(() => {
    vi.clearAllMocks()
    create.isPending = false
    update.isPending = false
    remove.isPending = false
})

describe('creating', () => {
    it('shows a line-numbered preview of the code as text', () => {
        render(<SnippetEditor />)
        type(/^Vulnerable code/, '<script>alert(1)</script>\nsecond')
        const preview = within(screen.getByTestId('code-preview'))
        expect(preview.getAllByRole('listitem')).toHaveLength(2)
        expect(preview.getAllByRole('listitem')[0]).toHaveTextContent('<script>alert(1)</script>')
        expect(document.querySelector('script')).toBeNull()
    })

    it('saves a draft with the payload built from the form', () => {
        render(<SnippetEditor />)
        fillBasics()
        addFinding('4', '5')
        fireEvent.click(screen.getByTestId('save-snippet'))
        expect(create.mutate).toHaveBeenCalledTimes(1)
        const payload = create.mutate.mock.calls[0][0]
        expect(payload).toMatchObject({ title: 'Login check', isPublished: false })
        expect(payload.vulnerableCode).toBe(CODE)
        expect(payload.findings[0]).toMatchObject({ lineStart: 4, lineEnd: 5 })
        act(() => (create.mutate.mock.calls[0][1] as Handlers).onSuccess?.())
        expect(nav.push).toHaveBeenCalledWith('/admin/code-review')
        expect(toast.addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
    })

    it('does not submit an invalid form and says what to fix', () => {
        render(<SnippetEditor />)
        fireEvent.click(screen.getByTestId('save-snippet'))
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByTestId('form-banner')).toHaveTextContent(/Please fix/)
        expect(document.querySelectorAll('[aria-invalid="true"]').length).toBeGreaterThan(0)
    })

    it('does not allow publishing without a finding', () => {
        render(<SnippetEditor />)
        fillBasics()
        fireEvent.click(screen.getByRole('checkbox', { name: /Published/ }))
        fireEvent.click(screen.getByTestId('save-snippet'))
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getAllByText(/Add at least one finding/).length).toBeGreaterThan(0)
    })
})

describe('finding ranges are checked as they change', () => {
    it('flags a range past the end of the code before any save', () => {
        render(<SnippetEditor />)
        fillBasics()
        addFinding('6', '12')
        expect(within(row(0)).getByText(/past the end of the code \(7 lines\)/)).toBeInTheDocument()
        expect(row(0)).toHaveAttribute('data-invalid', 'true')
    })

    it('flags two findings that share a line, and paints the shared lines', () => {
        render(<SnippetEditor />)
        fillBasics()
        addFinding('2', '4')
        addFinding('4', '6')
        expect(within(row(1)).getByText(/Overlaps finding 1/)).toBeInTheDocument()
        expect(within(row(0)).queryByText(/Overlaps/)).not.toBeInTheDocument()
        expect(screen.getByTestId('code-preview').querySelectorAll('[data-tone="conflict"]').length).toBeGreaterThan(0)
        fireEvent.click(screen.getByTestId('save-snippet'))
        expect(create.mutate).not.toHaveBeenCalled()
    })

    it('accepts adjacent findings', () => {
        render(<SnippetEditor />)
        fillBasics()
        addFinding('2', '3')
        addFinding('4', '5')
        expect(screen.queryByText(/Overlaps/)).not.toBeInTheDocument()
    })

    it('picks a range on the preview: first click, second click', () => {
        render(<SnippetEditor />)
        fillBasics()
        fireEvent.click(screen.getByRole('button', { name: /Add a finding/ }))
        fireEvent.click(within(row(0)).getByRole('button', { name: /Pick lines on the preview/ }))
        expect(screen.getByTestId('picking-banner')).toHaveTextContent('Picking lines for finding 1')
        fireEvent.click(document.getElementById('cr-preview-line-5') as HTMLElement)
        expect(screen.getByTestId('picking-banner')).toHaveTextContent('first line 5')
        fireEvent.click(document.getElementById('cr-preview-line-3') as HTMLElement)
        expect(screen.queryByTestId('picking-banner')).not.toBeInTheDocument()
        expect(within(row(0)).getByLabelText(/first line/)).toHaveValue('3')
        expect(within(row(0)).getByLabelText(/last line/)).toHaveValue('5')
        expect(screen.getByTestId('pick-note')).toHaveTextContent('lines 3 to 5')
    })

    it('keeps picking the same finding when an earlier one is removed', () => {
        render(<SnippetEditor />)
        fillBasics()
        fireEvent.click(screen.getByRole('button', { name: /Add a finding/ }))
        fireEvent.click(screen.getByRole('button', { name: /Add a finding/ }))
        fireEvent.click(within(row(1)).getByRole('button', { name: /Pick lines on the preview/ }))
        expect(screen.getByTestId('picking-banner')).toHaveTextContent('Picking lines for finding 2')
        fireEvent.click(screen.getByRole('button', { name: 'Remove finding 1' }))
        // The finding that was second is first now, and it is still the one being picked
        expect(screen.getByTestId('picking-banner')).toHaveTextContent('Picking lines for finding 1')
        fireEvent.click(document.getElementById('cr-preview-line-2') as HTMLElement)
        fireEvent.click(document.getElementById('cr-preview-line-3') as HTMLElement)
        expect(screen.getAllByTestId('finding-row')).toHaveLength(1)
        expect(within(row(0)).getByLabelText(/first line/)).toHaveValue('2')
        expect(within(row(0)).getByLabelText(/last line/)).toHaveValue('3')
    })

    it('stops picking when the finding being picked is removed', () => {
        render(<SnippetEditor />)
        fillBasics()
        fireEvent.click(screen.getByRole('button', { name: /Add a finding/ }))
        fireEvent.click(screen.getByRole('button', { name: /Add a finding/ }))
        fireEvent.click(within(row(0)).getByRole('button', { name: /Pick lines on the preview/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Remove finding 1' }))
        expect(screen.queryByTestId('picking-banner')).not.toBeInTheDocument()
        fireEvent.click(document.getElementById('cr-preview-line-2') as HTMLElement)
        expect(within(row(0)).getByLabelText(/first line/)).toHaveValue('')
    })

    it('does nothing when a line is clicked while not picking', () => {
        render(<SnippetEditor />)
        fillBasics()
        fireEvent.click(screen.getByRole('button', { name: /Add a finding/ }))
        fireEvent.click(document.getElementById('cr-preview-line-2') as HTMLElement)
        expect(within(row(0)).getByLabelText(/first line/)).toHaveValue('')
    })
})

describe('server errors', () => {
    const submitValid = () => {
        render(<SnippetEditor />)
        fillBasics()
        addFinding('4', '5')
        fireEvent.click(screen.getByTestId('save-snippet'))
        return create.mutate.mock.calls[0][1] as Handlers
    }

    it('marks the slug when it is taken', () => {
        const h = submitValid()
        act(() => h.onError?.(new ApiError('taken', 409, 'CR_SLUG_TAKEN')))
        expect(screen.getByTestId('form-banner')).toBeInTheDocument()
        expect(document.getElementById('cr-slug')).toHaveAttribute('aria-invalid', 'true')
        expect(nav.push).not.toHaveBeenCalled()
    })

    it('says why publishing is refused (CR_NOT_READY)', () => {
        const h = submitValid()
        act(() => h.onError?.(new ApiError('x', 409, 'CR_NOT_READY')))
        expect(screen.getByTestId('findings-error')).toBeInTheDocument()
    })

    it('puts each validation detail on its field and lists the ones without a field', () => {
        const h = submitValid()
        act(() => h.onError?.(new ApiError('bad', 400, 'VALIDATION_ERROR', [
            { field: 'title', message: 'Title is too short for the server' },
            { field: 'findings.0.lineEnd', message: 'Line 9 is outside the code' },
            { message: 'Something about the whole form' },
        ])))
        expect(screen.getByText('Title is too short for the server')).toBeInTheDocument()
        expect(within(row(0)).getByText('Line 9 is outside the code')).toBeInTheDocument()
        expect(screen.getByTestId('form-banner')).toHaveTextContent('Something about the whole form')
        expect(document.getElementById('cr-title')).toHaveAttribute('aria-invalid', 'true')
    })

    it('clears a field error when the field is edited', () => {
        const h = submitValid()
        act(() => h.onError?.(new ApiError('bad', 400, 'VALIDATION_ERROR', [{ field: 'title', message: 'Server dislikes it' }])))
        expect(screen.getByText('Server dislikes it')).toBeInTheDocument()
        type(/^Title/, 'Another title')
        expect(screen.queryByText('Server dislikes it')).not.toBeInTheDocument()
    })
})

describe('editing', () => {
    it('loads the snippet, keeps the slug fixed and saves with the slug as the ref', () => {
        render(<SnippetEditor snippet={makeAdminSnippet()} />)
        expect(screen.getByTestId('slug-readonly')).toHaveTextContent('sql-injection-login')
        expect(document.getElementById('cr-slug')).toBeNull()
        expect(screen.getByLabelText(/^Title/)).toHaveValue('Login check')
        type(/^Title/, 'Login check v2')
        fireEvent.click(screen.getByTestId('save-snippet'))
        expect(update.mutate).toHaveBeenCalledTimes(1)
        expect(update.mutate.mock.calls[0][0]).toMatchObject({ ref: 'sql-injection-login', payload: { title: 'Login check v2' } })
        expect(create.mutate).not.toHaveBeenCalled()
    })

    it('asks before deleting and explains a refusal for an exercise with progress', () => {
        render(<SnippetEditor snippet={makeAdminSnippet()} />)
        fireEvent.click(screen.getByRole('button', { name: /^Delete exercise/ }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete exercise' }))
        expect(remove.mutate).toHaveBeenCalledWith({ ref: 'sql-injection-login' }, expect.any(Object))
        // The buttons of the dialog never submit the form behind it
        expect(update.mutate).not.toHaveBeenCalled()
        act(() => (remove.mutate.mock.calls[0][1] as Handlers).onError?.(new ApiError('x', 409, 'CR_HAS_PROGRESS')))
        expect(screen.getByTestId('form-banner')).toHaveTextContent(/unpublish/i)
        expect(nav.push).not.toHaveBeenCalled()
    })

    it('offers to unpublish right there when a delete is refused because members passed it', () => {
        render(<SnippetEditor snippet={makeAdminSnippet({ isPublished: true })} />)
        fireEvent.click(screen.getByRole('button', { name: /^Delete exercise/ }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete exercise' }))
        act(() => (remove.mutate.mock.calls[0][1] as Handlers).onError?.(new ApiError('x', 409, 'CR_HAS_PROGRESS')))
        fireEvent.click(screen.getByTestId('unpublish-now'))
        expect(publish.mutate).toHaveBeenCalledWith({ ref: 'sql-injection-login', published: false }, expect.any(Object))
        act(() => (publish.mutate.mock.calls[0][1] as Handlers).onSuccess?.())
        expect(nav.push).toHaveBeenCalledWith('/admin/code-review')
    })

    it('has no unpublish action when the refused exercise is already a draft', () => {
        render(<SnippetEditor snippet={makeAdminSnippet({ isPublished: false })} />)
        fireEvent.click(screen.getByRole('button', { name: /^Delete exercise/ }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete exercise' }))
        act(() => (remove.mutate.mock.calls[0][1] as Handlers).onError?.(new ApiError('x', 409, 'CR_HAS_PROGRESS')))
        expect(screen.queryByTestId('unpublish-now')).not.toBeInTheDocument()
    })

    it('keeps the id of a hint through a save, and sends none for a new hint', () => {
        render(<SnippetEditor snippet={makeAdminSnippet()} />)
        fireEvent.click(screen.getByRole('button', { name: /Add a hint/ }))
        fireEvent.change(screen.getByLabelText(/^Hint 2 text/), { target: { value: 'A new hint.' } })
        fireEvent.click(screen.getByTestId('save-snippet'))
        const hints = update.mutate.mock.calls[0][0].payload.hints
        expect(hints[0]).toMatchObject({ id: 'h1' })
        expect(hints[1]).not.toHaveProperty('id')
    })

    describe('a key change members have to confirm', () => {
        const meta = { solveCount: 3, oldFindingCount: 2, newFindingCount: 1, oldHintCount: 2, newHintCount: 2 }

        it('shows the numbers, saves nothing until confirmed, and then resends with the confirmation', () => {
            render(<SnippetEditor snippet={makeAdminSnippet()} />)
            fireEvent.change(screen.getByLabelText(/^Finding 1 explanation/), { target: { value: 'Now the whole story of the finding.' } })
            fireEvent.click(screen.getByTestId('save-snippet'))
            const sent = update.mutate.mock.calls[0][0].payload
            expect(sent).not.toHaveProperty('confirmKeyChange')
            act(() => (update.mutate.mock.calls[0][1] as Handlers).onError?.(new ApiError('x', 409, 'CR_KEY_CHANGE_UNCONFIRMED', undefined, meta)))
            const dialog = screen.getByRole('dialog')
            expect(dialog).toHaveTextContent('3 members have solved this exercise')
            expect(dialog).toHaveTextContent('findings go from 2 to 1')
            expect(dialog).toHaveTextContent('hints from 2 to 2')
            expect(screen.queryByTestId('form-banner')).not.toBeInTheDocument()
            expect(update.mutate).toHaveBeenCalledTimes(1)
            fireEvent.click(within(dialog).getByRole('button', { name: 'Save the change' }))
            expect(update.mutate).toHaveBeenCalledTimes(2)
            expect(update.mutate.mock.calls[1][0]).toMatchObject({ ref: 'sql-injection-login', payload: { ...sent, confirmKeyChange: true } })
            act(() => (update.mutate.mock.calls[1][1] as Handlers).onSuccess?.())
            expect(nav.push).toHaveBeenCalledWith('/admin/code-review')
        })

        it('keeps editing when the author declines, and sends nothing more', () => {
            render(<SnippetEditor snippet={makeAdminSnippet()} />)
            type(/^Title/, 'Login check v2')
            fireEvent.click(screen.getByTestId('save-snippet'))
            act(() => (update.mutate.mock.calls[0][1] as Handlers).onError?.(new ApiError('x', 409, 'CR_KEY_CHANGE_UNCONFIRMED', undefined, meta)))
            fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep editing' }))
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
            expect(update.mutate).toHaveBeenCalledTimes(1)
            expect(screen.getByLabelText(/^Title/)).toHaveValue('Login check v2')
        })
    })

    it('is read-only for a moderator: no save, no delete, fields disabled', () => {
        render(<SnippetEditor snippet={makeAdminSnippet()} readOnly />)
        expect(screen.getByTestId('read-only-note')).toBeInTheDocument()
        expect(screen.queryByTestId('save-snippet')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Delete exercise/ })).not.toBeInTheDocument()
        expect(screen.getByLabelText(/^Title/)).toBeDisabled()
        expect(screen.getByRole('button', { name: /Add a finding/ })).toBeDisabled()
        fireEvent.submit(screen.getByTestId('snippet-editor'))
        expect(update.mutate).not.toHaveBeenCalled()
    })
})

describe('script and handler samples', () => {
    it('says that code and answer text are stored as written and titles are cleaned', () => {
        render(<SnippetEditor />)
        const note = screen.getByTestId('strip-note')
        expect(note).toHaveTextContent(/stored exactly as written/)
        expect(note).toHaveTextContent(/script-like text removed/)
        expect(note).not.toHaveTextContent(/seed file/)
    })

    it('does not warn about code or answer text: they are stored as written', () => {
        render(<SnippetEditor />)
        type(/^Vulnerable code/, 'el.innerHTML = "<img src=x onerror=alert(1)>"\nonce = 1')
        type(/^Overview/, '<script>alert(1)</script> explains it')
        expect(screen.queryByTestId('strip-warning')).not.toBeInTheDocument()
    })

    it('warns as soon as a title, description or tag has a script tag or an event handler', () => {
        render(<SnippetEditor />)
        expect(screen.queryByTestId('strip-warning')).not.toBeInTheDocument()
        type(/^Title/, 'Login <script>alert(1)</script>')
        expect(screen.getByTestId('strip-warning')).toBeInTheDocument()
        type(/^Title/, 'Login check')
        expect(screen.queryByTestId('strip-warning')).not.toBeInTheDocument()
        type(/^Description/, 'Look at <img src=x onerror=alert(1)>')
        expect(screen.getByTestId('strip-warning')).toBeInTheDocument()
        type(/^Description/, 'It is `<img onerror=x()>` in backticks')
        expect(screen.queryByTestId('strip-warning')).not.toBeInTheDocument()
    })
})
