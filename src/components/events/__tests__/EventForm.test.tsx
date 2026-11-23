import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeEvent, viewer } from '@/lib/events/__tests__/fixtures'

const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useEvents', () => ({ useCreateEvent: () => create, useUpdateEvent: () => update }))

import { EventForm } from '../EventForm'

const onDone = vi.fn()
const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

function fillRequired() {
    fill(/^Title/, 'Winter CTF Night')
    fill(/^Category/, 'ctf')
    fill(/^Time zone/, 'Europe/Berlin')
    fill(/^Start date/, '2099-12-05')
    fill(/^Start time/, '18:00')
    fill(/^Description/, 'Bring a laptop.')
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('EventForm (new event)', () => {
    it('shows every problem at once and does not call the API', () => {
        render(<EventForm mode="create" admin={false} cancelHref="/events" onDone={onDone} />)
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByTestId('form-error')).toHaveTextContent('Some fields need your attention')
        expect(screen.getByText('Title must be at least 5 characters')).toBeInTheDocument()
        expect(screen.getByText('Pick a category')).toBeInTheDocument()
        expect(screen.getByText('Pick a start date')).toBeInTheDocument()
        expect(screen.getByLabelText(/^Title/)).toHaveAttribute('aria-invalid', 'true')
    })

    it('sends a minimal payload, with explicit UTC instants and no blank strings', () => {
        render(<EventForm mode="create" admin={false} cancelHref="/events" onDone={onDone} />)
        fillRequired()
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(create.mutate).toHaveBeenCalledTimes(1)
        const payload = create.mutate.mock.calls[0][0]
        expect(payload).toEqual({
            title: 'Winter CTF Night', description: 'Bring a laptop.', category: 'ctf', locationType: 'online', timezone: 'Europe/Berlin',
            startDate: '2099-12-05T17:00:00.000Z', maxParticipants: 500, waitlistEnabled: true,
        })
    })

    it('starts with a capacity of 500 and refuses more for a member', () => {
        render(<EventForm mode="create" admin={false} cancelHref="/events" onDone={onDone} />)
        expect(screen.getByLabelText(/^Capacity/)).toHaveValue(500)
        fillRequired()
        fill(/^Capacity/, '900')
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByText(/Capacity is required/)).toBeInTheDocument()
    })

    it('shows how the time reads in the event zone', () => {
        render(<EventForm mode="create" admin={false} cancelHref="/events" onDone={onDone} />)
        fill(/^Time zone/, 'Europe/Berlin')
        fill(/^Start date/, '2099-12-05')
        fill(/^Start time/, '18:00')
        expect(screen.getByTestId('time-preview')).toHaveTextContent('Sat, Dec 5, 2099 · 6:00 PM')
        expect(screen.getByTestId('time-preview')).toHaveTextContent('Event time zone: Europe/Berlin')
    })

    it('puts the API field errors on the fields and shows the message', () => {
        create.mutate.mockImplementation((_p, opts) => opts.onError(new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [{ field: 'startDate', message: 'Start date must be in the future' }])))
        render(<EventForm mode="create" admin={false} cancelHref="/events" onDone={onDone} />)
        fillRequired()
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(screen.getByTestId('form-error')).toHaveTextContent('Start date must be in the future')
        expect(screen.getByText('Start date must be in the future', { selector: 'p#ef-startTime-error' })).toBeInTheDocument()
    })

    it.each([
        ['EVENT_PENDING_LIMIT', 429, /3 events waiting/],
        ['EVENT_DAILY_LIMIT', 429, /5 submissions/],
        ['EVENT_DUPLICATE', 409, /same time/],
        ['EVENT_EMAIL_NOT_VERIFIED', 403, /Verify your email/],
    ])('explains %s', (code, status, text) => {
        create.mutate.mockImplementation((_p, opts) => opts.onError(new ApiError('x', status, code)))
        render(<EventForm mode="create" admin={false} cancelHref="/events" onDone={onDone} />)
        fillRequired()
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(screen.getByTestId('form-error')).toHaveTextContent(text)
    })

    it('hands the saved event to the caller', async () => {
        const saved = makeEvent({ status: 'pending' })
        create.mutate.mockImplementation((_p, opts) => opts.onSuccess(saved))
        render(<EventForm mode="create" admin={false} cancelHref="/events" onDone={onDone} />)
        fillRequired()
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        await waitFor(() => expect(onDone).toHaveBeenCalledWith(saved))
    })

    it('blocks a member whose email is not verified', () => {
        render(<EventForm mode="create" admin={false} verified={false} cancelHref="/events" onDone={onDone} />)
        expect(screen.getByText(/Verify your email address before you submit/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled()
    })

    it('lets an administrator publish with no capacity limit and set the type', () => {
        render(<EventForm mode="create" admin cancelHref="/admin/events" onDone={onDone} />)
        fillRequired()
        fill(/^Event type/, 'official')
        fireEvent.click(screen.getByRole('button', { name: 'Publish event' }))
        const payload = create.mutate.mock.calls[0][0]
        expect(payload).toMatchObject({ eventType: 'official', isFeatured: false })
        expect(payload).not.toHaveProperty('maxParticipants')
    })

    it('only allows https links', () => {
        render(<EventForm mode="create" admin={false} cancelHref="/events" onDone={onDone} />)
        fillRequired()
        fill(/^Join link/, 'http://insecure.example.org')
        fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
        expect(screen.getByText('The join link must be a valid https link')).toBeInTheDocument()
        expect(create.mutate).not.toHaveBeenCalled()
    })
})

describe('EventForm (editing)', () => {
    const event = makeEvent({ endDate: '2026-12-05T19:00:00.000Z', viewer: viewer({ canManage: true }), eventLink: 'https://meet.example.org/x' })

    it('loads the saved values in the event zone and sends only the change', () => {
        render(<EventForm mode="edit" admin={false} event={event} cancelHref="/events/x" onDone={onDone} />)
        expect(screen.getByLabelText(/^Start time/)).toHaveValue('18:00')
        expect(screen.getByLabelText(/^End time/)).toHaveValue('20:00')
        fill(/^Description/, 'Updated text')
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        expect(update.mutate).toHaveBeenCalledWith({ id: event._id, payload: { description: 'Updated text' } }, expect.any(Object))
    })

    it('locks the fields a creator cannot change on a public event', () => {
        render(<EventForm mode="edit" admin={false} event={event} cancelHref="/events/x" onDone={onDone} />)
        expect(screen.getByLabelText(/^Title/)).toBeDisabled()
        expect(screen.getByLabelText(/^Category/)).toBeDisabled()
        expect(screen.getByLabelText(/^Description/)).toBeEnabled()
    })

    it('leaves everything open for an administrator', () => {
        render(<EventForm mode="edit" admin event={event} cancelHref="/admin/events" onDone={onDone} />)
        expect(screen.getByLabelText(/^Title/)).toBeEnabled()
    })

    it('says so when nothing changed', () => {
        render(<EventForm mode="edit" admin={false} event={event} cancelHref="/events/x" onDone={onDone} />)
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        expect(update.mutate).not.toHaveBeenCalled()
        expect(screen.getByTestId('form-error')).toHaveTextContent('not changed anything')
    })

    it('resubmits a rejected event', () => {
        const rejected = makeEvent({ status: 'rejected', rejectionReason: 'No agenda', viewer: viewer({ canManage: true }) })
        render(<EventForm mode="edit" admin={false} event={rejected} cancelHref="/my-events" onDone={onDone} />)
        expect(screen.getByLabelText(/^Title/)).toBeEnabled()
        fill(/^Description/, 'Now with an agenda')
        fireEvent.click(screen.getByRole('button', { name: 'Save and send for review' }))
        expect(update.mutate).toHaveBeenCalled()
    })
})
