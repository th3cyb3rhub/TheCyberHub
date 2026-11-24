import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMine } from '@/lib/internships/__tests__/fixtures'

vi.mock('@/components/events/PageShell', async () => {
    const actual = await vi.importActual<typeof import('@/components/events/PageShell')>('@/components/events/PageShell')
    return { ...actual, useRequireLogin: () => ({ user: { id: 'u1' }, ready: true }) }
})
const q = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('@/hooks/queries/useInternships', () => ({ useMyApplications: () => q.current, useWithdrawApplication: () => ({ mutate: vi.fn(), isPending: false }) }))

import { MyApplicationsView } from '../MyApplicationsView'

const pages = (...a: unknown[]) => ({ data: { pages: [{ data: a }] }, isLoading: false, isError: false, hasNextPage: false, refetch: vi.fn() })

beforeEach(() => { vi.clearAllMocks() })

describe('MyApplicationsView', () => {
    it('shows the status, the timeline with dates and the reviewer note', () => {
        q.current = pages(makeMine())
        render(<MyApplicationsView />)
        const card = screen.getByTestId('my-application')
        expect(card).toHaveAttribute('data-status', 'reviewing')
        expect(within(card).getByRole('link', { name: 'Summer Security Internship' })).toHaveAttribute('href', '/internships/aaaaaaaaaaaaaaaaaaaaaaaa')
        expect(within(card).getAllByRole('listitem').length).toBeGreaterThan(2)
        expect(within(card).getByTestId('review-note')).toHaveTextContent('Looking at your repo now')
        expect(within(card).getByTestId('status-timeline')).toHaveTextContent('Pending')
    })

    it('reads a program past its deadline as closed, although the API sends it as open', () => {
        const stored = { _id: 'a'.repeat(24), title: 'Late Program', status: 'open' as const, type: 'internship' as const, startDate: '2027-01-01T00:00:00.000Z', endDate: '2027-03-01T00:00:00.000Z' }
        q.current = pages(
            makeMine({ _id: '1'.repeat(24), cohort: { ...stored, applicationDeadline: '2020-01-01T00:00:00.000Z' } }),
            makeMine({ _id: '2'.repeat(24), cohort: { ...stored, title: 'Fresh Program', applicationDeadline: '2099-01-01T00:00:00.000Z' } }),
        )
        render(<MyApplicationsView />)
        const [late, fresh] = screen.getAllByTestId('my-application')
        expect(late).toHaveTextContent('Closed')
        expect(fresh).not.toHaveTextContent('Closed')
        expect(fresh).toHaveTextContent('Open')
    })

    it('hides what was sent until it is opened, and shows answers as text', () => {
        q.current = pages(makeMine({ answers: [{ field: 'x', label: 'Favourite tool', value: '<b>Burp</b>' }], githubUrl: 'javascript:alert(1)' }))
        const { container } = render(<MyApplicationsView />)
        expect(container.querySelector('b')).toBeNull()
        expect(screen.getByText('<b>Burp</b>')).toBeInTheDocument()
        expect(container.querySelector('a[href^="javascript"]')).toBeNull()
    })

    it('offers withdraw for pending, reviewing and accepted, and opens the confirmation', () => {
        for (const status of ['pending', 'reviewing', 'accepted'] as const) {
            q.current = pages(makeMine({ status }))
            const { unmount } = render(<MyApplicationsView />)
            expect(screen.getByRole('button', { name: /^Withdraw$/ })).toBeInTheDocument()
            unmount()
        }
        q.current = pages(makeMine({ status: 'pending' }))
        render(<MyApplicationsView />)
        fireEvent.click(screen.getByRole('button', { name: /^Withdraw$/ }))
        expect(screen.getByRole('dialog', { name: 'Withdraw your application?' })).toBeInTheDocument()
    })

    it('offers no withdraw for rejected or withdrawn', () => {
        for (const status of ['rejected', 'withdrawn'] as const) {
            q.current = pages(makeMine({ status }))
            const { unmount } = render(<MyApplicationsView />)
            expect(screen.queryByRole('button', { name: /^Withdraw$/ })).toBeNull()
            unmount()
        }
    })

    it('does not break when the program was removed', () => {
        q.current = pages(makeMine({ cohort: null }))
        render(<MyApplicationsView />)
        expect(screen.getByText('This program was removed')).toBeInTheDocument()
    })

    it('shows the empty state with a way to browse', () => {
        q.current = { ...pages(), data: { pages: [{ data: [] }] } }
        render(<MyApplicationsView />)
        expect(screen.getByText('You have not applied yet')).toBeInTheDocument()
        expect(screen.getAllByRole('link', { name: 'Browse programs' }).length).toBeGreaterThan(0)
    })
})
