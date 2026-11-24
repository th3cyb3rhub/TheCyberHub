import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeResource } from '@/lib/learning/__tests__/fixtures'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'user', isVerified: true } }) }))

const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const check = vi.hoisted(() => ({ current: { data: undefined, isFetching: false } as { data: unknown; isFetching: boolean } }))
vi.mock('@/hooks/queries/useResources', () => ({
    useCreateResource: () => create, useUpdateResource: () => update, useCheckUrl: () => check.current,
}))

import { ResourceForm } from '../ResourceForm'

function fill(values: { title?: string; url?: string; type?: string; topic?: string; difficulty?: string; description?: string }) {
    const set = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
    if (values.title !== undefined) set('Title', values.title)
    if (values.url !== undefined) set('Link', values.url)
    if (values.type) set('Type', values.type)
    if (values.topic) set('Topic', values.topic)
    if (values.difficulty) set('Difficulty', values.difficulty)
    if (values.description !== undefined) set(/Why is it worth it/, values.description)
}
const good = { title: 'OWASP Top 10', url: 'https://owasp.org/Top10', type: 'article', topic: 'web-security', difficulty: 'beginner', description: 'The ten most critical web application risks, explained simply.' }

beforeEach(() => {
    vi.clearAllMocks()
    check.current = { data: undefined, isFetching: false }
})

describe('submitting', () => {
    it('shows every problem and does not call the API when the form is invalid', () => {
        render(<ResourceForm />)
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByTestId('form-error')).toHaveTextContent('Fix the highlighted fields')
        expect(screen.getByText(/Title must be at least 5/)).toBeInTheDocument()
        expect(screen.getByText('Choose what kind of resource it is')).toBeInTheDocument()
        expect(screen.getByText(/Description must be at least 20/)).toBeInTheDocument()
    })
    it('rejects a javascript link before anything is sent', () => {
        render(<ResourceForm />)
        fill({ ...good, url: 'javascript:alert(1)' })
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByText(/valid http or https link/)).toBeInTheDocument()
    })
    it('sends the parsed values, with tags from the chip box', () => {
        render(<ResourceForm />)
        fill(good)
        const tags = screen.getByLabelText(/Tags/)
        fireEvent.change(tags, { target: { value: 'XSS, web' } })
        expect(screen.getByText('#xss')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(create.mutate).toHaveBeenCalledWith(expect.objectContaining({ title: 'OWASP Top 10', tags: ['xss', 'web'], isFree: true, difficulty: 'beginner' }), expect.any(Object))
    })
    it('removes a tag with its button', () => {
        render(<ResourceForm />)
        fireEvent.change(screen.getByLabelText(/Tags/), { target: { value: 'xss,' } })
        fireEvent.click(screen.getByRole('button', { name: 'Remove tag xss' }))
        expect(screen.queryByText('#xss')).toBeNull()
    })
    it('thanks the member after a successful submit', () => {
        create.mutate.mockImplementation((_v, opts) => opts.onSuccess(makeResource({ status: 'pending' })))
        render(<ResourceForm />)
        fill(good)
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(screen.getByTestId('submitted')).toHaveTextContent('Submitted for review')
        expect(screen.getByRole('link', { name: 'My submissions' })).toHaveAttribute('href', '/resources/my')
    })
    it('shows the API reason and the field error when the server refuses', () => {
        create.mutate.mockImplementation((_v, opts) => opts.onError(new ApiError('Bad', 400, 'VALIDATION_ERROR', [{ field: 'url', message: 'Link is blocked.' }])))
        render(<ResourceForm />)
        fill(good)
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(screen.getByTestId('form-error')).toHaveTextContent('Link is blocked.')
        expect(screen.getAllByText('Link is blocked.').length).toBeGreaterThan(0)
    })
    it('links to the existing entry when the server reports a duplicate', () => {
        create.mutate.mockImplementation((_v, opts) => opts.onError(new ApiError('dup', 409, 'RESOURCE_DUPLICATE', undefined, { existing: { slug: 'owasp-top-10', title: 'OWASP Top 10', status: 'approved' } })))
        render(<ResourceForm />)
        fill(good)
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(screen.getByTestId('form-error')).toHaveTextContent('already in the library')
        expect(within(screen.getByTestId('form-error')).getByRole('link')).toHaveAttribute('href', '/resources/owasp-top-10')
    })
})

describe('duplicate preview', () => {
    it('warns before submitting and blocks the button', () => {
        check.current = { isFetching: false, data: { valid: true, domain: 'owasp.org', duplicate: { status: 'approved', slug: 'owasp-top-10', title: 'OWASP Top 10' } } }
        render(<ResourceForm />)
        fill(good)
        fireEvent.blur(screen.getByLabelText('Link'))
        expect(screen.getByTestId('duplicate')).toHaveTextContent('Already in the library')
        expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled()
    })
    it('says "you submitted this" with a link only when the server names the entry', () => {
        check.current = { isFetching: false, data: { valid: true, domain: 'a.org', duplicate: { status: 'pending', id: 'r9', title: 'My guide' } } }
        render(<ResourceForm />)
        const note = screen.getByTestId('duplicate')
        expect(note).toHaveTextContent('You already submitted this link')
        expect(within(note).getByRole('link', { name: 'My guide' })).toHaveAttribute('href', '/resources/r9')
    })
    it('shows a neutral message, with no link, for someone else\'s pending entry', () => {
        check.current = { isFetching: false, data: { valid: true, domain: 'a.org', duplicate: { status: 'pending' } } }
        render(<ResourceForm />)
        const note = screen.getByTestId('duplicate')
        expect(note).toHaveTextContent('This link is already waiting for review.')
        expect(note).not.toHaveTextContent('You already submitted')
        expect(within(note).queryByRole('link')).toBeNull()
        expect(document.body.innerHTML).not.toContain('/resources/undefined')
    })
    it('says the link is new when nothing matches', () => {
        check.current = { isFetching: false, data: { valid: true, domain: 'owasp.org', duplicate: null } }
        render(<ResourceForm />)
        expect(screen.getByText(/not in the library yet \(owasp.org\)/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Submit for review' })).toBeEnabled()
    })
    it('explains a blocked link', () => {
        check.current = { isFetching: false, data: { valid: false, reason: 'blocked' } }
        render(<ResourceForm />)
        expect(screen.getByText(/shorteners and blocked sites/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled()
    })
})

describe('editing', () => {
    it('warns that a change goes back to review and saves to the slug', () => {
        const r = makeResource()
        update.mutate.mockImplementation((_v, opts) => opts.onSuccess(r))
        render(<ResourceForm resource={r} />)
        expect(screen.getByRole('note')).toHaveTextContent('sends this resource back for review')
        expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('OWASP Top 10')
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        expect(update.mutate).toHaveBeenCalledWith({ slug: 'owasp-top-10', input: expect.objectContaining({ title: 'OWASP Top 10' }) }, expect.any(Object))
        expect(push).toHaveBeenCalledWith('/resources/owasp-top-10')
    })
    it('offers to resubmit a rejected resource', () => {
        render(<ResourceForm resource={makeResource({ status: 'rejected' })} />)
        expect(screen.getByRole('button', { name: 'Save and resubmit' })).toBeInTheDocument()
    })
})
