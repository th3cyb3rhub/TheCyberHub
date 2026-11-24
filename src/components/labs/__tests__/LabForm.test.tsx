import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeLab } from '@/lib/labs/__tests__/fixtures'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
type Callbacks = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void }
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const remove = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useLabs', () => ({ useCreateLab: () => create, useUpdateLab: () => update, useDeleteLab: () => remove }))

import { LabForm } from '../LabForm'

const adminLab = (over = {}) => makeLab({ admin: { status: 'draft', flagCount: 2, pointsOverride: 0, startCount: 1 }, ...over })
const field = (label: string | RegExp) => screen.getByLabelText(typeof label === 'string' ? new RegExp(`^${label}(?![\\w])`) : label)
const fill = (label: string | RegExp, value: string) => fireEvent.change(field(label), { target: { value } })
const submit = () => fireEvent.click(screen.getByRole('button', { name: /Save draft|Save changes|Create and publish/ }))
const call = (m: { mutate: ReturnType<typeof vi.fn> }) => m.mutate.mock.calls[m.mutate.mock.calls.length - 1] as [Record<string, unknown>, Callbacks]

beforeEach(() => { vi.clearAllMocks(); create.isPending = false; update.isPending = false })

describe('LabForm (create)', () => {
    it('sends a new draft without flags when none were typed', () => {
        render(<LabForm />)
        fill('Title', 'SQL basics')
        fill('Description', 'Break a login.')
        submit()
        expect(create.mutate).toHaveBeenCalledTimes(1)
        const payload = call(create)[0]
        expect(payload).toMatchObject({ title: 'SQL basics', description: 'Break a login.', status: 'draft', category: 'web-security', difficulty: 'easy' })
        expect('flags' in payload).toBe(false)
    })

    it('shows field errors and sends nothing when the form is wrong', () => {
        render(<LabForm />)
        fill('Title', 'ab')
        submit()
        expect(create.mutate).not.toHaveBeenCalled()
        expect(field('Title')).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByText(/at least 3 characters/)).toBeInTheDocument()
        expect(screen.getByTestId('form-error')).toHaveTextContent(/Please fix/)
    })

    it('blocks publishing without a flag, then sends the typed flag', () => {
        render(<LabForm />)
        fill('Title', 'SQL basics')
        fill('Description', 'Break a login.')
        fill('Status', 'published')
        submit()
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByText('Add at least one flag before you publish this lab.', { selector: 'p#status-error' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Add a flag' }))
        fill('Flag 1', 'flag{sqli}')
        submit()
        expect(call(create)[0].flags).toEqual([{ value: 'flag{sqli}', caseSensitive: false }])
        expect(call(create)[0].status).toBe('published')
    })

    it('adds hints and files with the right limits', () => {
        render(<LabForm />)
        fireEvent.click(screen.getByRole('button', { name: 'Add a hint' }))
        expect(field(/Hint 1 cost/)).toHaveValue(10)
        for (let i = 0; i < 9; i++) fireEvent.click(screen.getByRole('button', { name: 'Add a hint' }))
        expect(screen.getByRole('button', { name: 'Add a hint' })).toBeDisabled()
        expect(screen.getAllByTestId('hint-row')).toHaveLength(10)
        fireEvent.click(screen.getByRole('button', { name: 'Add a file' }))
        fill('File 1 link', 'javascript:alert(1)')
        fill('Title', 'SQL basics')
        fill('Description', 'x')
        submit()
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByText('Use a public link that starts with http:// or https://', { selector: 'p#file-' + (document.querySelector('[data-testid="file-row"] input[type="url"]') as HTMLInputElement).id.replace('file-', '').replace('-url', '') + '-url-error' })).toBeInTheDocument()
    })

    it('previews instructions as inert markdown', () => {
        const { container } = render(<LabForm />)
        fireEvent.change(document.getElementById('instructions') as HTMLTextAreaElement, { target: { value: '## Goal\n\n<script>alert(1)</script> [x](javascript:alert(2))' } })
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
        const preview = screen.getByTestId('instructions-preview')
        expect(preview.querySelector('script')).toBeNull()
        expect(preview.querySelector('a[href^="javascript"]')).toBeNull()
        expect(within(preview).getByRole('heading', { name: 'Goal' })).toBeInTheDocument()
        expect(container.querySelector('script')).toBeNull()
    })

    it('maps server field errors, a taken slug and a not-ready publish to their fields', () => {
        render(<LabForm />)
        fill('Title', 'SQL basics')
        fill('Description', 'Break a login.')
        submit()
        const cb = call(create)[1]
        act(() => cb.onError?.(new ApiError('x', 409, 'LAB_SLUG_TAKEN')))
        expect(screen.getByText(/Another lab already uses this slug/)).toBeInTheDocument()
        submit()
        act(() => call(create)[1].onError?.(new ApiError('v', 400, 'VALIDATION_ERROR', [{ field: 'files.0.url', message: 'must point to a public website' }, { field: 'createdBy', message: 'not allowed' }])))
        expect(screen.getByTestId('form-error-lines')).toHaveTextContent('CreatedBy: not allowed')
    })

    it('goes back to the list after a save', () => {
        render(<LabForm />)
        fill('Title', 'SQL basics')
        fill('Description', 'Break a login.')
        submit()
        act(() => call(create)[1].onSuccess?.({ slug: 'sql-basics' }))
        expect(push).toHaveBeenCalledWith('/admin/labs')
    })
})

describe('LabForm (edit)', () => {
    it('says flags are hidden and how many are set, and offers to enter new ones', () => {
        render(<LabForm lab={adminLab()} />)
        const note = screen.getByTestId('flags-note')
        expect(note).toHaveTextContent('This lab has 2 flags set')
        expect(note).toHaveTextContent('hidden')
        expect(note).toHaveTextContent('Enter new ones to replace all of them')
        expect(screen.queryAllByTestId('flag-row')).toHaveLength(0)
        expect(screen.getByRole('button', { name: 'Enter new flags' })).toBeInTheDocument()
    })

    it('does not save and does not send flags when nothing changed', () => {
        render(<LabForm lab={adminLab()} />)
        submit()
        expect(update.mutate).not.toHaveBeenCalled()
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'info' }))
    })

    it('sends only the changed field, and no flags, for an edit of the title', () => {
        render(<LabForm lab={adminLab()} />)
        fill('Title', 'A better title')
        submit()
        expect(call(update)[0]).toEqual({ slug: 'sql-injection-basics', payload: { title: 'A better title' } })
    })

    it('sends the typed flags, replacing all of them', () => {
        render(<LabForm lab={adminLab()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Enter new flags' }))
        fill('Flag 1', 'flag{fresh}')
        submit()
        expect(call(update)[0]).toEqual({ slug: 'sql-injection-basics', payload: { flags: [{ value: 'flag{fresh}', caseSensitive: false }] } })
    })

    it('lets a lab with flags be published without typing any', () => {
        render(<LabForm lab={adminLab()} />)
        fill('Status', 'published')
        submit()
        expect(call(update)[0].payload).toEqual({ status: 'published' })
    })

    it('blocks publishing a lab that has no flag', () => {
        render(<LabForm lab={adminLab({ admin: { status: 'draft', flagCount: 0, pointsOverride: 0, startCount: 0 } })} />)
        expect(screen.getByTestId('flags-note')).toHaveTextContent('no flag yet')
        fill('Status', 'published')
        submit()
        expect(update.mutate).not.toHaveBeenCalled()
        expect(screen.getByText('Add at least one flag before you publish this lab.', { selector: 'p#status-error' })).toBeInTheDocument()
    })

    it('deletes after a confirm and goes back to the list', () => {
        render(<LabForm lab={adminLab()} />)
        fireEvent.click(screen.getByRole('button', { name: /Delete lab/ }))
        expect(remove.mutate).not.toHaveBeenCalled()
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete lab' }))
        expect(call(remove)[0]).toEqual({ slug: 'sql-injection-basics' })
        act(() => call(remove)[1].onSuccess?.({}))
        expect(push).toHaveBeenCalledWith('/admin/labs')
    })

    it('offers to archive when the lab has completions', () => {
        render(<LabForm lab={adminLab()} />)
        fireEvent.click(screen.getByRole('button', { name: /Delete lab/ }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete lab' }))
        act(() => call(remove)[1].onError?.(new ApiError('x', 409, 'LAB_HAS_COMPLETIONS')))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Members have completed this lab')
        fireEvent.click(within(dialog).getByRole('button', { name: 'Archive lab' }))
        expect(call(update)[0]).toEqual({ slug: 'sql-injection-basics', payload: { status: 'archived' } })
    })

    it('shows a server hints lock on the hints list', () => {
        render(<LabForm lab={adminLab()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Add a hint' }))
        fill(/Hint 1 text/, 'new hint')
        fill('Title', 'x'.repeat(5))
        submit()
        act(() => call(update)[1].onError?.(new ApiError('locked', 409, 'LAB_HINTS_LOCKED', [{ field: 'hints', message: 'Members have started this lab: hints cannot be removed.' }])))
        expect(screen.getAllByText(/hints cannot be removed/).length).toBeGreaterThan(0)
    })
})
