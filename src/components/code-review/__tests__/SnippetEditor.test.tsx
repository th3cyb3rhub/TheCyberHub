import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { CODE, makeAdminSnippet } from '@/lib/codeReview/__tests__/fixtures'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
const toast = vi.hoisted(() => ({ addToast: vi.fn() }))
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const remove = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn() }) }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => toast }))
vi.mock('@/hooks/queries/useCodeReview', () => ({ useCreateSnippet: () => create, useUpdateSnippet: () => update, useDeleteSnippet: () => remove }))

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
        act(() => (remove.mutate.mock.calls[0][1] as Handlers).onError?.(new ApiError('x', 409, 'CR_HAS_PROGRESS')))
        expect(screen.getByTestId('form-banner')).toHaveTextContent(/unpublish/i)
        expect(nav.push).not.toHaveBeenCalled()
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
    it('always says they have to go in through the seed file', () => {
        render(<SnippetEditor />)
        expect(screen.getByTestId('strip-note')).toHaveTextContent(/seed file/)
    })

    it('warns as soon as the code holds a script tag or an event handler', () => {
        render(<SnippetEditor />)
        expect(screen.queryByTestId('strip-warning')).not.toBeInTheDocument()
        type(/^Vulnerable code/, 'el.innerHTML = "<img src=x onerror=alert(1)>"')
        expect(screen.getByTestId('strip-warning')).toBeInTheDocument()
        type(/^Vulnerable code/, 'plain code')
        expect(screen.queryByTestId('strip-warning')).not.toBeInTheDocument()
        type(/^Vulnerable code/, '<script>alert(1)</script>')
        expect(screen.getByTestId('strip-warning')).toBeInTheDocument()
    })
})
