import { StrictMode } from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: '' }))
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: nav.replace, push: nav.push }),
    useSearchParams: () => new URLSearchParams(nav.search),
}))
const auth = vi.hoisted(() => ({ login: vi.fn(), verify2faLogin: vi.fn(), register: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false, ...auth }) }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

import AuthPage from '../page'
import { ApiError } from '@/lib/api'
import { stashSessionNotice } from '@/lib/authSession'
import { stashPending2fa } from '@/lib/pending2fa'

beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    nav.search = ''
})

describe('the sign-in page', () => {
    it('shows why the member is here, also under StrictMode where effects run twice', async () => {
        stashSessionNotice('revoked')
        render(<StrictMode><AuthPage /></StrictMode>)
        expect(await screen.findByText('This device was signed out. Please sign in again.')).toBeInTheDocument()
    })

    it('keeps a pending second step under StrictMode', async () => {
        stashPending2fa('temp-1')
        render(<StrictMode><AuthPage /></StrictMode>)
        expect(await screen.findByLabelText('Authenticator Code')).toBeInTheDocument()
    })

    it('returns to the password step with a message when the second step has expired', async () => {
        const user = userEvent.setup()
        stashPending2fa('temp-1')
        auth.verify2faLogin.mockRejectedValue(new ApiError('Session expired, sign in again', 401, 'AUTH_2FA_CHALLENGE_EXPIRED'))
        render(<AuthPage />)
        await user.type(await screen.findByLabelText('Authenticator Code'), '123456')
        await user.click(screen.getByRole('button', { name: /verify code/i }))
        await waitFor(() => expect(screen.queryByLabelText('Authenticator Code')).not.toBeInTheDocument())
        expect(screen.getByRole('alert')).toHaveTextContent(/expired/i)
        expect(screen.getByLabelText('Email')).toBeInTheDocument()
    })

    it('stays on the code step for a wrong code', async () => {
        const user = userEvent.setup()
        stashPending2fa('temp-1')
        auth.verify2faLogin.mockRejectedValue(new ApiError('Invalid 2FA code', 401, 'AUTH_TOKEN_INVALID'))
        render(<AuthPage />)
        await user.type(await screen.findByLabelText('Authenticator Code'), '123456')
        await user.click(screen.getByRole('button', { name: /verify code/i }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Invalid 2FA code')
        expect(screen.getByLabelText('Authenticator Code')).toBeInTheDocument()
        await act(async () => {})
    })
})
