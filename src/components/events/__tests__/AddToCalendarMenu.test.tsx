import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api/events', () => ({
    eventIcsUrl: (slug: string) => `https://api.example.test/api/events/${slug}/ics`,
    webcalUrl: (url: string) => url.replace(/^https?:/i, 'webcal:'),
}))

import { AddToCalendarMenu } from '../AddToCalendarMenu'

const props = { slug: 'winter-ctf', title: 'Winter CTF', startDate: '2026-12-05T17:00:00.000Z', endDate: '2026-12-05T19:00:00.000Z' }
const openMenu = () => fireEvent.keyDown(screen.getByRole('button', { name: /Add to calendar/ }), { key: 'Enter' })

beforeEach(() => vi.clearAllMocks())

describe('AddToCalendarMenu', () => {
    it('offers Google Calendar, the .ics file from the API and a copyable webcal link', async () => {
        render(<AddToCalendarMenu {...props} />)
        openMenu()
        expect(await screen.findByRole('menuitem', { name: /Google Calendar/ })).toHaveAttribute('href', expect.stringContaining('https://calendar.google.com/calendar/render'))
        expect(screen.getByRole('menuitem', { name: /\.ics/ })).toHaveAttribute('href', 'https://api.example.test/api/events/winter-ctf/ics')
        expect(screen.getByRole('menuitem', { name: 'Copy webcal link' })).toBeInTheDocument()
    })

    it('copies the webcal address and says so', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        render(<AddToCalendarMenu {...props} />)
        openMenu()
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy webcal link' }))
        expect(writeText).toHaveBeenCalledWith('webcal://api.example.test/api/events/winter-ctf/ics')
        await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Copied the webcal link' })).toBeInTheDocument())
    })

    it('points to the .ics file when the clipboard is blocked', async () => {
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
        render(<AddToCalendarMenu {...props} />)
        openMenu()
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy webcal link' }))
        await waitFor(() => expect(screen.getByRole('menuitem', { name: /Could not copy/ })).toBeInTheDocument())
    })
})
