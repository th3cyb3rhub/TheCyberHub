import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const push = vi.hoisted(() => ({ unsubscribeThisDevice: vi.fn() }))
vi.mock('@/lib/push', () => push)
vi.mock('@/lib/api', () => ({ API_URL: 'http://api.test' }))

import { AuthProvider, useAuth } from '../AuthContext'

function Probe() {
    const { user, logout } = useAuth()
    return (
        <div>
            <span data-testid="user">{user ? user.username : 'none'}</span>
            <button onClick={logout}>logout</button>
        </div>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.localStorage.setItem('token', 'tok-1')
    push.unsubscribeThisDevice.mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'u1', username: 'ada', role: 'user' } }) }))
})

const signedIn = async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('ada'))
}

describe('logout', () => {
    it('stops pushes to this browser, using the token it is about to clear', async () => {
        await signedIn()
        let tokenWhenCalled: string | null = 'unset'
        push.unsubscribeThisDevice.mockImplementation(async () => { tokenWhenCalled = window.localStorage.getItem('token') })
        act(() => { screen.getByText('logout').click() })
        expect(push.unsubscribeThisDevice).toHaveBeenCalledWith('tok-1')
        // It was started before the token was removed
        expect(tokenWhenCalled).toBe('tok-1')
        expect(window.localStorage.getItem('token')).toBeNull()
        expect(screen.getByTestId('user')).toHaveTextContent('none')
    })

    it('still signs out when the unsubscribe fails', async () => {
        await signedIn()
        push.unsubscribeThisDevice.mockRejectedValue(new Error('offline'))
        act(() => { screen.getByText('logout').click() })
        await act(async () => {})
        expect(screen.getByTestId('user')).toHaveTextContent('none')
        expect(window.localStorage.getItem('token')).toBeNull()
    })

    it('still signs out when the unsubscribe throws at once', async () => {
        await signedIn()
        push.unsubscribeThisDevice.mockImplementation(() => { throw new Error('no service worker') })
        act(() => { screen.getByText('logout').click() })
        expect(screen.getByTestId('user')).toHaveTextContent('none')
    })
})
