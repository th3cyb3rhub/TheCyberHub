import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeEvent, viewer } from '@/lib/events/__tests__/fixtures'

const replace = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }))
const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
const ev = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('@/hooks/queries/useEvents', () => ({
    useEvent: () => ev.current,
    useCreateEvent: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdateEvent: () => ({ mutate: vi.fn(), isPending: false }),
}))

import SubmitEventPage from '@/app/events/submit/page'
import EditEventPage from '@/app/events/[slug]/edit/page'
import NewAdminEventPage from '@/app/admin/events/new/page'
import AdminEditEventPage from '@/app/admin/events/[id]/edit/page'

// React 19's `use` reads an already resolved promise synchronously when it carries a status
const resolved = <T,>(value: T) => Object.assign(Promise.resolve(value), { status: 'fulfilled', value }) as Promise<T>

beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({ user: { id: 'u1', role: 'user', isVerified: true }, loading: false })
    ev.current = { data: makeEvent({ viewer: viewer({ canManage: true }) }), isLoading: false, isError: false }
})

describe('events pages: access control', () => {
    it('/events/submit sends a signed-out visitor to sign in and back', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        render(<SubmitEventPage />)
        expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Fevents%2Fsubmit')
        expect(screen.queryByRole('form')).toBeNull()
    })

    it('/events/submit shows the form to a member, as a review submission', () => {
        render(<SubmitEventPage />)
        expect(screen.getByRole('button', { name: 'Submit for review' })).toBeInTheDocument()
    })

    it('/events/submit lets an administrator publish directly', () => {
        useAuth.mockReturnValue({ user: { id: 'a', role: 'owner' }, loading: false })
        render(<SubmitEventPage />)
        expect(screen.getByRole('button', { name: 'Publish event' })).toBeInTheDocument()
    })

    it('the edit page needs a sign in', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        render(<EditEventPage params={resolved({ slug: 'winter-ctf-night' })} />)
        expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Fevents%2Fwinter-ctf-night%2Fedit')
    })

    it('the edit page is closed to people who do not manage the event', () => {
        ev.current = { data: makeEvent({ viewer: viewer({ canManage: false }) }), isLoading: false, isError: false }
        render(<EditEventPage params={resolved({ slug: 'winter-ctf-night' })} />)
        expect(screen.getByText('You cannot open this page')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
    })

    it('the edit page opens for the creator', () => {
        render(<EditEventPage params={resolved({ slug: 'winter-ctf-night' })} />)
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    })

    it('a cancelled event cannot be edited', () => {
        ev.current = { data: makeEvent({ status: 'cancelled', viewer: viewer({ canManage: true }) }), isLoading: false, isError: false }
        render(<EditEventPage params={resolved({ slug: 'winter-ctf-night' })} />)
        expect(screen.getByText('A cancelled event cannot be edited.')).toBeInTheDocument()
    })

    it('the admin pages keep members and moderators out', () => {
        useAuth.mockReturnValue({ user: { id: 'm', role: 'moderator' }, loading: false })
        const { unmount } = render(<NewAdminEventPage />)
        expect(screen.getByText('You cannot open this page')).toBeInTheDocument()
        unmount()
        render(<AdminEditEventPage params={resolved({ id: '64b000000000000000000001' })} />)
        expect(screen.getByText('You cannot open this page')).toBeInTheDocument()
    })

    it('the admin edit page loads the event by id and shows the form to an administrator', () => {
        useAuth.mockReturnValue({ user: { id: 'a', role: 'admin' }, loading: false })
        render(<AdminEditEventPage params={resolved({ id: '64b000000000000000000001' })} />)
        expect(screen.getByLabelText(/^Title/)).toHaveValue('Winter CTF Night')
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    })

    it('the admin edit page shows the API error when the event cannot load', () => {
        useAuth.mockReturnValue({ user: { id: 'a', role: 'admin' }, loading: false })
        ev.current = { data: undefined, isLoading: false, isError: true, error: new Error('Boom') }
        render(<AdminEditEventPage params={resolved({ id: 'x' })} />)
        expect(screen.getByText('Boom')).toBeInTheDocument()
    })
})
