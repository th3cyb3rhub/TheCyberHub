import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
    user: { id: 'u1' } as { id: string } | null,
    supported: true,
    permission: 'default' as NotificationPermission,
    dismissed: false,
    key: { data: 'BKEY' as string | null, isLoading: false, isError: false, refetch: vi.fn() },
    prefs: { data: { push: { enabled: false } } as unknown, isLoading: false, isError: false, refetch: vi.fn() },
    mutateAsync: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    writeDismissed: vi.fn(),
    track: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('@/hooks/queries/useNotifications', () => ({
    useNotificationPreferences: () => state.prefs,
    useUpdateNotificationPreferences: () => ({ mutateAsync: state.mutateAsync }),
}))
vi.mock('@/hooks/queries/usePushKey', () => ({ usePushPublicKey: () => state.key }))
vi.mock('@/lib/analytics', () => ({ trackEvent: state.track }))
vi.mock('@/lib/push', () => ({
    isPushSupported: () => state.supported,
    currentPermission: () => state.permission,
    readPromptDismissed: () => state.dismissed,
    writePromptDismissed: state.writeDismissed,
    subscribeThisDevice: state.subscribe,
    unsubscribeThisDevice: state.unsubscribe,
}))

import PushSettings from '../PushSettings'
import PushPrompt from '../PushPrompt'

const requestPermission = vi.fn()

beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: 'u1' }
    state.supported = true
    state.permission = 'default'
    state.dismissed = false
    state.key = { data: 'BKEY', isLoading: false, isError: false, refetch: vi.fn() }
    state.prefs = { data: { push: { enabled: false } }, isLoading: false, isError: false, refetch: vi.fn() }
    state.mutateAsync.mockResolvedValue({})
    state.subscribe.mockResolvedValue(undefined)
    state.unsubscribe.mockResolvedValue(undefined)
    requestPermission.mockImplementation(async () => { state.permission = 'granted'; return 'granted' })
    vi.stubGlobal('Notification', { requestPermission })
})

describe('PushSettings', () => {
    it('says so when the browser cannot do push', async () => {
        state.supported = false
        render(<PushSettings />)
        expect(await screen.findByText(/cannot show push notifications/i)).toBeInTheDocument()
        expect(screen.queryByRole('switch')).toBeNull()
    })

    it('hides everything when the server has push switched off', async () => {
        state.key = { data: null, isLoading: false, isError: false, refetch: vi.fn() }
        const { container } = render(<PushSettings />)
        await waitFor(() => expect(container).toBeEmptyDOMElement())
    })

    it('shows a spinner while it finds out what is possible', () => {
        state.key = { data: null, isLoading: true, isError: false, refetch: vi.fn() }
        render(<PushSettings />)
        expect(screen.getByRole('status', { name: /checking push/i })).toBeInTheDocument()
    })

    it('explains how to unblock when notifications are denied, and cannot be switched on', async () => {
        state.permission = 'denied'
        render(<PushSettings />)
        expect(await screen.findByText(/blocked for this site/i)).toBeInTheDocument()
        expect(screen.getByRole('switch', { name: /push notifications for your account/i })).toBeDisabled()
    })

    it('asks for permission, subscribes, saves the setting and records the opt-in', async () => {
        render(<PushSettings />)
        const toggle = await screen.findByRole('switch', { name: /push notifications for your account/i })
        expect(toggle).toHaveAttribute('aria-checked', 'false')
        fireEvent.click(toggle)
        await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledWith({ push: { enabled: true } }))
        expect(requestPermission).toHaveBeenCalled()
        expect(state.subscribe).toHaveBeenCalledWith('BKEY')
        expect(state.track).toHaveBeenCalledWith('push_opt_in', { source: 'settings' })
    })

    it('stays off, and says why, when the member declines the browser question', async () => {
        requestPermission.mockResolvedValue('default')
        render(<PushSettings />)
        fireEvent.click(await screen.findByRole('switch'))
        expect(await screen.findByRole('alert')).toHaveTextContent(/stay off/i)
        expect(state.subscribe).not.toHaveBeenCalled()
        expect(state.track).not.toHaveBeenCalled()
    })

    it('shows a clear message when the device limit is reached', async () => {
        state.subscribe.mockRejectedValue(Object.assign(new Error('limit'), { code: 'PUSH_LIMIT_REACHED' }))
        render(<PushSettings />)
        fireEvent.click(await screen.findByRole('switch'))
        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent(/5 devices/)
        expect(alert).not.toHaveTextContent(/turn .* off/i)
        expect(state.mutateAsync).not.toHaveBeenCalled()
        expect(state.track).not.toHaveBeenCalled()
    })

    it('hides itself when the server reports push as disabled during opt-in', async () => {
        state.subscribe.mockRejectedValue(Object.assign(new Error('off'), { code: 'PUSH_DISABLED' }))
        render(<PushSettings />)
        fireEvent.click(await screen.findByRole('switch'))
        await waitFor(() => expect(state.key.refetch).toHaveBeenCalled())
    })

    it('shows it on when granted and enabled, and turning it off unsubscribes this device', async () => {
        state.permission = 'granted'
        state.prefs = { data: { push: { enabled: true } }, isLoading: false, isError: false, refetch: vi.fn() }
        render(<PushSettings />)
        const toggle = await screen.findByRole('switch', { name: /push notifications for your account/i })
        expect(toggle).toHaveAttribute('aria-checked', 'true')
        fireEvent.click(toggle)
        await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledWith({ push: { enabled: false } }))
        expect(state.unsubscribe).toHaveBeenCalled()
    })

    it('says the switch covers the whole account', async () => {
        state.permission = 'granted'
        state.prefs = { data: { push: { enabled: true } }, isLoading: false, isError: false, refetch: vi.fn() }
        render(<PushSettings />)
        expect(await screen.findByRole('heading', { name: 'Push notifications for your account' })).toBeInTheDocument()
        expect(screen.getByText(/stops push on all your devices/i)).toBeInTheDocument()
    })

    it('offers a retry when the settings cannot be loaded', async () => {
        state.prefs = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() }
        render(<PushSettings />)
        fireEvent.click(await screen.findByRole('button', { name: /try again/i }))
        expect(state.prefs.refetch).toHaveBeenCalled()
    })
})

describe('PushPrompt', () => {
    it('offers push, and turning it on records where it was offered', async () => {
        render(<PushPrompt source="notifications_page" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }))
        await waitFor(() => expect(state.track).toHaveBeenCalledWith('push_opt_in', { source: 'notifications_page' }))
    })

    it('remembers when it is dismissed', async () => {
        render(<PushPrompt source="first_notification" variant="floating" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
        expect(state.writeDismissed).toHaveBeenCalled()
        expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
    })

    it('stays away once dismissed in an earlier visit', async () => {
        state.dismissed = true
        const { container } = render(<PushPrompt source="notifications_page" />)
        await act(async () => {})
        expect(container).toBeEmptyDOMElement()
    })

    it.each([
        ['unsupported browser', () => { state.supported = false }],
        ['push disabled on the server', () => { state.key.data = null }],
        ['notifications blocked', () => { state.permission = 'denied' }],
        ['push already on', () => {
            state.permission = 'granted'
            state.prefs = { data: { push: { enabled: true } }, isLoading: false, isError: false, refetch: vi.fn() }
        }],
    ])('is not shown for %s', async (_name, arrange) => {
        arrange()
        const { container } = render(<PushPrompt source="notifications_page" />)
        await act(async () => {})
        expect(container).toBeEmptyDOMElement()
    })

    it('shows the device limit message inside the prompt', async () => {
        state.subscribe.mockRejectedValue(Object.assign(new Error('limit'), { code: 'PUSH_LIMIT_REACHED' }))
        render(<PushPrompt source="notifications_page" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }))
        expect(await screen.findByRole('alert')).toHaveTextContent(/5 devices/)
    })
})
