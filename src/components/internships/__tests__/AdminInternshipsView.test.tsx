import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeCard } from '@/lib/internships/__tests__/fixtures'

const auth = vi.hoisted(() => ({ current: { user: { id: 'm1', role: 'moderator' } as { id: string; role: string } | null, loading: false } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
const list = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const close = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@/hooks/queries/useInternships', () => ({ useAdminInternships: () => list.current, useCloseCohort: () => close }))

import { AdminInternshipsView } from '../AdminInternshipsView'

const staffCard = (over = {}) => makeCard({ isActive: true, acceptedCount: 3, applicationCount: 12, storedStatus: 'open', ...over })
const data = (cards: unknown[]) => ({ data: { data: cards, pagination: { page: 1, limit: 20, total: cards.length, totalPages: 1, hasMore: false } }, isLoading: false, isError: false, refetch: vi.fn() })

beforeEach(() => { vi.clearAllMocks(); auth.current = { user: { id: 'm1', role: 'moderator' }, loading: false }; list.current = data([staffCard()]) })

describe('AdminInternshipsView', () => {
    it.each(['moderator', 'admin', 'owner'])('is open to a %s', (role) => {
        auth.current = { user: { id: 'x', role }, loading: false }
        render(<AdminInternshipsView />)
        expect(screen.getByRole('heading', { name: 'Internship programs' })).toBeInTheDocument()
    })

    it('says no to a member', () => {
        auth.current = { user: { id: 'x', role: 'user' }, loading: false }
        render(<AdminInternshipsView />)
        expect(screen.getByRole('heading', { name: 'You cannot open this page' })).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Internship programs' })).toBeNull()
    })

    it('shows the status, the accepted over the capacity and the number of applications', () => {
        render(<AdminInternshipsView />)
        const row = screen.getByTestId('admin-cohort')
        expect(row).toHaveAttribute('data-status', 'open')
        expect(within(row).getByTestId('admin-counts')).toHaveTextContent('3 / 10 accepted')
        expect(within(row).getByTestId('admin-counts')).toHaveTextContent('12 applications')
        expect(within(row).getByRole('link', { name: /Edit/ })).toHaveAttribute('href', `/admin/internships/${'a'.repeat(24)}/edit`)
        expect(within(row).getByRole('link', { name: /Applications/ })).toHaveAttribute('href', `/admin/internships/${'a'.repeat(24)}/applications`)
    })

    it('says "no limit" for capacity 0 and marks a hidden program', () => {
        list.current = data([staffCard({ capacity: 0, spotsLeft: null, isActive: false })])
        render(<AdminInternshipsView />)
        expect(screen.getByTestId('admin-counts')).toHaveTextContent('3 accepted (no limit)')
        expect(screen.getByText('Hidden')).toBeInTheDocument()
    })

    it('asks before it closes a program, and closes it only after the confirmation', () => {
        render(<AdminInternshipsView />)
        fireEvent.click(screen.getByRole('button', { name: /^Close$/ }))
        expect(close.mutate).not.toHaveBeenCalled()
        expect(screen.getByRole('dialog')).toHaveTextContent('Close applications for Summer Security Internship?')
        fireEvent.click(screen.getByRole('button', { name: 'Close applications' }))
        expect(close.mutate).toHaveBeenCalledWith({ id: 'a'.repeat(24) })
    })

    it('offers Close only while applications are open', () => {
        list.current = data([staffCard({ status: 'closed', applicationsOpen: false, storedStatus: 'closed' }), staffCard({ _id: 'b'.repeat(24), status: 'draft', storedStatus: 'draft' })])
        render(<AdminInternshipsView />)
        expect(screen.queryByRole('button', { name: /^Close$/ })).toBeNull()
    })
})
