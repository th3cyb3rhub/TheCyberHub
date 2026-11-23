import { render, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
    user: { id: 'u1' } as { id: string } | null,
    supported: true,
    permission: 'granted' as NotificationPermission,
    prefs: { data: { push: { enabled: true } } as unknown },
    key: { data: 'BKEY' as string | null },
    subscribe: vi.fn(),
    keyEnabled: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('@/hooks/queries/useNotifications', () => ({ useNotificationPreferences: () => state.prefs }))
vi.mock('@/hooks/queries/usePushKey', () => ({ usePushPublicKey: (enabled: boolean) => { state.keyEnabled(enabled); return enabled ? state.key : { data: undefined } } }))
vi.mock('@/lib/push', () => ({
    isPushSupported: () => state.supported,
    currentPermission: () => state.permission,
    subscribeThisDevice: state.subscribe,
}))

import PushSync from '../PushSync'

beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: 'u1' }
    state.supported = true
    state.permission = 'granted'
    state.prefs = { data: { push: { enabled: true } } }
    state.key = { data: 'BKEY' }
    state.subscribe.mockResolvedValue(undefined)
})

describe('PushSync', () => {
    it('subscribes again on load when push is on and permission is granted', async () => {
        render(<PushSync />)
        await waitFor(() => expect(state.subscribe).toHaveBeenCalledWith('BKEY'))
        expect(state.subscribe).toHaveBeenCalledTimes(1)
    })

    it.each([
        ['permission was never granted', () => { state.permission = 'default' }],
        ['the browser cannot do push', () => { state.supported = false }],
        ['push is off in the settings', () => { state.prefs = { data: { push: { enabled: false } } } }],
        ['nobody is signed in', () => { state.user = null }],
        ['the server has push switched off', () => { state.key = { data: null } }],
    ])('does nothing when %s', async (_name, arrange) => {
        arrange()
        render(<PushSync />)
        await act(async () => {})
        expect(state.subscribe).not.toHaveBeenCalled()
    })

    it('swallows a failed refresh', async () => {
        state.subscribe.mockRejectedValue(new Error('offline'))
        render(<PushSync />)
        await waitFor(() => expect(state.subscribe).toHaveBeenCalled())
    })
})
