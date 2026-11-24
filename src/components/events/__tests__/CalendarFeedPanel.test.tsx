import React from 'react'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'user' }, loading: false }) }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
vi.mock('@/lib/events/clock', () => ({ useViewerZone: () => 'UTC', useNow: () => null }))
const api = vi.hoisted(() => ({ getCalendarTokenStatus: vi.fn(), createCalendarToken: vi.fn(), revokeCalendarToken: vi.fn() }))
vi.mock('@/lib/api/events', () => api)

import { CalendarFeedPanel } from '../CalendarFeedPanel'

const SECRET = 'tchcal_ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210zyxwvut'
const created = (rotated = false) => ({ url: `https://api.example.test/api/events/me/calendar.ics?token=${SECRET}`, webcalUrl: `webcal://api.example.test/api/events/me/calendar.ics?token=${SECRET}`, createdAt: '2026-11-24T10:00:00.000Z', rotated })
const off = { active: false, createdAt: null, rotatedAt: null, lastUsedAt: null }
const on = { active: true, createdAt: '2026-11-20T09:00:00.000Z', rotatedAt: null, lastUsedAt: '2026-11-23T08:15:00.000Z' }

let qc: QueryClient
const renderPanel = () => render(<QueryClientProvider client={qc}><CalendarFeedPanel /></QueryClientProvider>)
const cacheHoldsSecret = () => JSON.stringify([
    qc.getQueryCache().getAll().map((q) => q.state.data),
    qc.getMutationCache().getAll().map((m) => [m.state.data, m.state.variables]),
]).includes(SECRET)

beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('CalendarFeedPanel', () => {
    it('offers to create a feed when there is none', async () => {
        api.getCalendarTokenStatus.mockResolvedValue(off)
        renderPanel()
        expect(await screen.findByRole('button', { name: /Create my feed/ })).toBeInTheDocument()
    })

    it('shows the address once, with a warning and copy buttons, and forgets it when the dialog closes', async () => {
        api.getCalendarTokenStatus.mockResolvedValue(off)
        api.createCalendarToken.mockResolvedValue(created())
        renderPanel()
        fireEvent.click(await screen.findByRole('button', { name: /Create my feed/ }))

        const dialog = await screen.findByRole('dialog', { name: 'Your calendar address' })
        expect(within(dialog).getByRole('alert')).toHaveTextContent(/Anyone who has this link can see the events you registered for/)
        expect((within(dialog).getByLabelText(/Calendar address/) as HTMLInputElement).value).toBe(created().url)
        expect((within(dialog).getByLabelText(/Calendar link/) as HTMLInputElement).value).toBe(created().webcalUrl)
        fireEvent.click(within(dialog).getAllByRole('button', { name: /Copy/ })[0])
        await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(created().url))
        expect(cacheHoldsSecret()).toBe(false)

        fireEvent.click(within(dialog).getByRole('button', { name: 'I have copied it' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(document.body.innerHTML).not.toContain(SECRET)
        expect(cacheHoldsSecret()).toBe(false)
        expect(JSON.stringify([window.localStorage, window.sessionStorage, Object.entries(localStorage)])).not.toContain(SECRET)
    })

    it('shows when the feed was made and last used, never the address', async () => {
        api.getCalendarTokenStatus.mockResolvedValue(on)
        renderPanel()
        expect(await screen.findByTestId('feed-created')).toHaveTextContent('Nov 20, 2026 at 9:00 AM')
        expect(screen.getByTestId('feed-last-used')).toHaveTextContent('Nov 23, 2026 at 8:15 AM')
        expect(document.body.innerHTML).not.toContain('token=')
    })

    it('says "not used yet" for a feed no app has read', async () => {
        api.getCalendarTokenStatus.mockResolvedValue({ ...on, lastUsedAt: null })
        renderPanel()
        expect(await screen.findByTestId('feed-last-used')).toHaveTextContent('Not used yet')
    })

    it('asks before it replaces the address, then shows the new one once', async () => {
        api.getCalendarTokenStatus.mockResolvedValue(on)
        api.createCalendarToken.mockResolvedValue(created(true))
        renderPanel()
        fireEvent.click(await screen.findByRole('button', { name: /Replace the address/ }))
        const confirm = screen.getByRole('dialog', { name: 'Replace your calendar address?' })
        expect(confirm).toHaveTextContent(/stops working at once/)
        expect(api.createCalendarToken).not.toHaveBeenCalled()
        fireEvent.click(within(confirm).getByRole('button', { name: 'Replace the address' }))
        expect(await screen.findByRole('dialog', { name: 'Your new calendar address' })).toBeInTheDocument()
        expect(api.createCalendarToken).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByRole('button', { name: 'I have copied it' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(document.body.innerHTML).not.toContain(SECRET)
    })

    it('does not replace the address when the confirmation is cancelled', async () => {
        api.getCalendarTokenStatus.mockResolvedValue(on)
        renderPanel()
        fireEvent.click(await screen.findByRole('button', { name: /Replace the address/ }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Go back' }))
        expect(api.createCalendarToken).not.toHaveBeenCalled()
    })

    it('asks before it turns the feed off', async () => {
        api.getCalendarTokenStatus.mockResolvedValue(on)
        api.revokeCalendarToken.mockImplementation(async () => { api.getCalendarTokenStatus.mockResolvedValue(off) })
        renderPanel()
        fireEvent.click(await screen.findByRole('button', { name: /Turn off the feed/ }))
        const confirm = screen.getByRole('dialog', { name: 'Turn off your calendar feed?' })
        expect(api.revokeCalendarToken).not.toHaveBeenCalled()
        fireEvent.click(within(confirm).getByRole('button', { name: 'Turn off the feed' }))
        await waitFor(() => expect(api.revokeCalendarToken).toHaveBeenCalledTimes(1))
        expect(await screen.findByRole('button', { name: /Create my feed/ })).toBeInTheDocument()
    })

    it('shows the friendly message when the server cannot make the address (503)', async () => {
        api.getCalendarTokenStatus.mockResolvedValue(off)
        api.createCalendarToken.mockRejectedValue(new ApiError('x', 503))
        renderPanel()
        fireEvent.click(await screen.findByRole('button', { name: /Create my feed/ }))
        await waitFor(() => expect(addToast).toHaveBeenCalledWith({ variant: 'error', message: 'Calendar feed is not available right now. Please try again later.' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows an error with a retry when the status cannot be read', async () => {
        api.getCalendarTokenStatus.mockRejectedValueOnce(new ApiError('x', 500)).mockResolvedValue(off)
        renderPanel()
        expect(await screen.findByRole('alert')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByRole('button', { name: /Create my feed/ })).toBeInTheDocument()
    })
})
