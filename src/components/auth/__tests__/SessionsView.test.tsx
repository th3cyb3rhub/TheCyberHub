import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const nav = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }) }))
const auth = vi.hoisted(() => ({ logout: vi.fn(), state: { user: { id: 'u1' } as { id: string } | null, loading: false, token: 'tok' as string | null } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ ...auth.state, logout: auth.logout }) }))
const api = vi.hoisted(() => ({ listSessions: vi.fn(), revokeSession: vi.fn(), revokeOtherSessions: vi.fn() }))
vi.mock('@/lib/api/sessions', () => api)

import { SessionsView } from '../SessionsView'
import { ApiError } from '@/lib/api'

const chromeMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const now = Date.now()
const ago = (ms: number) => new Date(now - ms).toISOString()

const here = { id: 'a'.repeat(32), current: true, userAgent: chromeMac, ipAddress: '203.0.113.7', lastUsedAt: ago(30_000), createdAt: ago(86_400_000 * 3) }
const phone = { id: 'b'.repeat(32), current: false, userAgent: iphone, ipAddress: '198.51.100.9', lastUsedAt: ago(3 * 3600_000), createdAt: ago(86_400_000 * 9) }
const other = { id: 'c'.repeat(32), current: false, userAgent: null, ipAddress: null, lastUsedAt: ago(5 * 86_400_000), createdAt: ago(86_400_000 * 20) }

const mount = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SessionsView />
    </QueryClientProvider>,
)

beforeEach(() => {
    vi.clearAllMocks()
    auth.state = { user: { id: 'u1' }, loading: false, token: 'tok' }
    api.listSessions.mockResolvedValue([here, phone, other])
    api.revokeSession.mockResolvedValue(undefined)
    api.revokeOtherSessions.mockResolvedValue(2)
    auth.logout.mockResolvedValue(undefined)
})

describe('SessionsView', () => {
    it('sends a signed-out visitor to sign in and back', () => {
        auth.state = { user: null, loading: false, token: null }
        mount()
        expect(nav.replace).toHaveBeenCalledWith('/auth?redirect=%2Fprofile%2Fsessions')
        expect(api.listSessions).not.toHaveBeenCalled()
    })

    it('lists the devices, marks the current session and offers sign out only for the others', async () => {
        mount()
        const rows = await screen.findAllByTestId('session-row')
        expect(rows).toHaveLength(3)
        expect(within(rows[0]).getByText('Chrome on macOS')).toBeInTheDocument()
        expect(within(rows[0]).getByText('Current session')).toBeInTheDocument()
        expect(within(rows[0]).getByText(/203\.0\.113\.7/)).toBeInTheDocument()
        expect(within(rows[0]).getByText('just now')).toBeInTheDocument()
        expect(within(rows[0]).queryByRole('button')).toBeNull()
        expect(rows[0]).toHaveAttribute('aria-current', 'true')
        expect(within(rows[1]).getByText('Safari on iOS')).toBeInTheDocument()
        expect(within(rows[1]).getByText('3 hours ago')).toBeInTheDocument()
        expect(within(rows[1]).queryByText('Current session')).toBeNull()
        // A client with no user agent or address is still readable
        expect(within(rows[2]).getByText('Unknown device')).toBeInTheDocument()
        expect(within(rows[2]).getByText(/Unknown address/)).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: /Signed-in devices \(3\)/ })).toBeInTheDocument()
    })

    it('signs one device out with a name a screen reader can tell apart', async () => {
        const user = userEvent.setup()
        mount()
        await screen.findAllByTestId('session-row')
        api.listSessions.mockResolvedValue([here, other])
        await user.click(screen.getByRole('button', { name: 'Sign out Safari on iOS, 198.51.100.9' }))
        expect(api.revokeSession).toHaveBeenCalledWith(phone.id)
        expect(await screen.findByText('Signed out Safari on iOS.')).toBeInTheDocument()
        await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(2))
    })

    it('treats a session that is already gone as signed out', async () => {
        const user = userEvent.setup()
        api.revokeSession.mockRejectedValue(new ApiError('Session not found', 404, 'RESOURCE_NOT_FOUND'))
        mount()
        await screen.findAllByTestId('session-row')
        await user.click(screen.getByRole('button', { name: /Sign out Safari on iOS/ }))
        expect(await screen.findByText('Signed out Safari on iOS.')).toBeInTheDocument()
    })

    it('shows a failure to sign a device out and keeps the list', async () => {
        const user = userEvent.setup()
        api.revokeSession.mockRejectedValue(new ApiError('Server exploded', 500))
        mount()
        await screen.findAllByTestId('session-row')
        await user.click(screen.getByRole('button', { name: /Sign out Safari on iOS/ }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded')
        expect(screen.getAllByTestId('session-row')).toHaveLength(3)
    })

    it('signs out the other sessions and says how many', async () => {
        const user = userEvent.setup()
        mount()
        await screen.findAllByTestId('session-row')
        api.listSessions.mockResolvedValue([here])
        await user.click(screen.getByRole('button', { name: 'Sign out other sessions' }))
        expect(api.revokeOtherSessions).toHaveBeenCalledTimes(1)
        expect(await screen.findByText('Signed out 2 other sessions.')).toBeInTheDocument()
        await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(1))
        expect(screen.getByRole('button', { name: 'Sign out other sessions' })).toBeDisabled()
    })

    it('asks before signing out everywhere, then signs out on every device and goes to sign-in', async () => {
        const user = userEvent.setup()
        mount()
        await screen.findAllByTestId('session-row')
        await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('every device, this one included')
        expect(auth.logout).not.toHaveBeenCalled()
        await user.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }))
        await waitFor(() => expect(auth.logout).toHaveBeenCalledWith({ allDevices: true }))
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/auth'))
    })

    it('does nothing when the confirmation is cancelled', async () => {
        const user = userEvent.setup()
        mount()
        await screen.findAllByTestId('session-row')
        await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }))
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(auth.logout).not.toHaveBeenCalled()
    })

    it('stays signed in and says so when signing out everywhere fails', async () => {
        const user = userEvent.setup()
        auth.logout.mockRejectedValue(new ApiError('Could not sign out of all devices. Please try again.', 500))
        mount()
        await screen.findAllByTestId('session-row')
        await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }))
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out everywhere' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out of all devices')
        expect(nav.replace).not.toHaveBeenCalledWith('/auth')
    })

    it('shows a skeleton while loading, then an error with a way to retry', async () => {
        const user = userEvent.setup()
        api.listSessions.mockRejectedValueOnce(new ApiError('The server is down', 400))
        mount()
        expect(screen.getByLabelText('Loading sessions')).toHaveAttribute('aria-busy', 'true')
        expect(await screen.findByRole('alert')).toHaveTextContent('The server is down')
        await user.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findAllByTestId('session-row')).toHaveLength(3)
    })

    it('has an empty state', async () => {
        api.listSessions.mockResolvedValue([])
        mount()
        expect(await screen.findByText('No active sessions found')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Sign out other sessions' })).toBeDisabled()
    })
})
