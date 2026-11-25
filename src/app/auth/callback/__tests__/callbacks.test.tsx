import { StrictMode } from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: '' }))
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: nav.replace, push: nav.push }),
    useSearchParams: () => new URLSearchParams(nav.search),
}))
const auth = vi.hoisted(() => ({ user: null as unknown, loginWithGithub: vi.fn(), loginWithGoogle: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, loginWithGithub: auth.loginWithGithub, loginWithGoogle: auth.loginWithGoogle }) }))

import GitHubCallbackPage from '../github/page'
import GoogleCallbackPage from '../google/page'
import { stashOAuthReturn } from '@/lib/oauthReturn'
import { takePending2fa } from '@/lib/pending2fa'
import { ApiError } from '@/lib/api'

const member = { id: 'u1', createdAt: '2020-01-01T00:00:00Z', onboarding: { completedAt: '2020-01-02T00:00:00Z' } }

beforeEach(() => {
    vi.clearAllMocks()
    nav.search = ''
    auth.user = null
    sessionStorage.clear()
    window.history.replaceState({}, '', '/auth/callback/x')
})

afterEach(() => { vi.useRealTimers() })

describe('GitHub callback', () => {
    it('shows progress, then success, and takes the member to the page they were heading for', async () => {
        nav.search = 'code=abc'
        stashOAuthReturn('/ctf/competitions/x?tab=team')
        auth.loginWithGithub.mockImplementation(async () => { auth.user = member })
        const { rerender } = render(<GitHubCallbackPage />)
        expect(screen.getByRole('status')).toHaveTextContent('Signing in with GitHub')
        await waitFor(() => expect(screen.getByRole('heading', { name: 'You are signed in' })).toBeInTheDocument())
        rerender(<GitHubCallbackPage />)
        expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/ctf/competitions/x?tab=team')
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/ctf/competitions/x?tab=team'), { timeout: 3000 })
        // Leaving replaces the callback entry, so Back does not return to it
        expect(nav.push).not.toHaveBeenCalled()
        expect(auth.loginWithGithub).toHaveBeenCalledWith('abc')
    })

    it('sends the code once, however often the page re-renders', async () => {
        nav.search = 'code=abc'
        auth.loginWithGithub.mockResolvedValue(undefined)
        const { rerender } = render(<GitHubCallbackPage />)
        rerender(<GitHubCallbackPage />)
        rerender(<GitHubCallbackPage />)
        await act(async () => {})
        expect(auth.loginWithGithub).toHaveBeenCalledTimes(1)
    })

    it('sends the code once under StrictMode, which runs effects twice in development', async () => {
        nav.search = 'code=abc'
        auth.loginWithGithub.mockResolvedValue(undefined)
        render(<StrictMode><GitHubCallbackPage /></StrictMode>)
        await act(async () => {})
        expect(auth.loginWithGithub).toHaveBeenCalledTimes(1)
    })

    it('removes the one-time code from the address bar before calling the API', async () => {
        window.history.replaceState({ keep: 1 }, '', '/auth/callback/github?code=abc&state=s')
        nav.search = 'code=abc&state=s'
        let seenWhenCalled = 'unset'
        auth.loginWithGithub.mockImplementation(async () => { seenWhenCalled = window.location.search + window.location.hash })
        render(<GitHubCallbackPage />)
        await act(async () => {})
        expect(auth.loginWithGithub).toHaveBeenCalledWith('abc')
        expect(seenWhenCalled).toBe('')
        expect(window.location.href).not.toContain('code=')
    })

    it('never follows an unsafe remembered page', async () => {
        nav.search = 'code=abc'
        sessionStorage.setItem('oauthReturnTo', '//evil.example')
        auth.loginWithGithub.mockImplementation(async () => { auth.user = member })
        const { rerender } = render(<GitHubCallbackPage />)
        await waitFor(() => expect(screen.getByRole('heading', { name: 'You are signed in' })).toBeInTheDocument())
        rerender(<GitHubCallbackPage />)
        expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/profile')
    })

    it('hands a second step to the sign-in page, which keeps the page they were heading for', async () => {
        nav.search = 'code=abc'
        stashOAuthReturn('/jobs/x')
        auth.loginWithGithub.mockResolvedValue({ requires2FA: true, tempToken: 'temp-9' })
        render(<GitHubCallbackPage />)
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/auth?redirect=%2Fjobs%2Fx'))
        expect(takePending2fa()).toBe('temp-9')
    })

    it('says what went wrong and offers the way back to sign-in', async () => {
        nav.search = 'code=abc'
        stashOAuthReturn('/jobs/x')
        auth.loginWithGithub.mockRejectedValue(new ApiError('GitHub account has no verified email', 400))
        render(<GitHubCallbackPage />)
        expect(await screen.findByRole('alert')).toHaveTextContent('GitHub account has no verified email')
        expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/auth?redirect=%2Fjobs%2Fx')
        expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
    })

    it('does not repeat what a provider put in the URL', async () => {
        nav.search = 'error=<b>send+money+to+me</b>'
        render(<GitHubCallbackPage />)
        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent('The provider could not complete the sign-in.')
        expect(alert).not.toHaveTextContent('send money')
        expect(auth.loginWithGithub).not.toHaveBeenCalled()
    })

    it('explains a cancelled sign-in and a missing code', async () => {
        nav.search = 'error=access_denied'
        const { unmount } = render(<GitHubCallbackPage />)
        expect(await screen.findByRole('alert')).toHaveTextContent('You cancelled the sign-in')
        unmount()
        nav.search = ''
        render(<GitHubCallbackPage />)
        expect(await screen.findByRole('alert')).toHaveTextContent('did not send an authorization code')
    })
})

describe('Google callback', () => {
    it('signs in with the token in the URL hash and goes on', async () => {
        window.history.replaceState({}, '', '/auth/callback/google#id_token=tok-1&state=x')
        auth.loginWithGoogle.mockImplementation(async () => { auth.user = member })
        stashOAuthReturn('/blog/write')
        const { rerender } = render(<GoogleCallbackPage />)
        await waitFor(() => expect(screen.getByRole('heading', { name: 'You are signed in' })).toBeInTheDocument())
        rerender(<GoogleCallbackPage />)
        expect(auth.loginWithGoogle).toHaveBeenCalledWith('tok-1')
        expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/blog/write')
    })

    it('removes the token from the address bar before calling the API, and does not leave a way back to it', async () => {
        window.history.replaceState({}, '', '/auth/callback/google#id_token=tok-1&state=x')
        let seenWhenCalled = 'unset'
        auth.loginWithGoogle.mockImplementation(async () => { seenWhenCalled = window.location.hash + window.location.search; auth.user = member })
        const { rerender } = render(<GoogleCallbackPage />)
        await waitFor(() => expect(screen.getByRole('heading', { name: 'You are signed in' })).toBeInTheDocument())
        expect(auth.loginWithGoogle).toHaveBeenCalledWith('tok-1')
        expect(seenWhenCalled).toBe('')
        expect(window.location.href).not.toContain('id_token')
        rerender(<GoogleCallbackPage />)
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/profile'), { timeout: 3000 })
        expect(nav.push).not.toHaveBeenCalled()
    })

    it('sends the token once under StrictMode', async () => {
        window.history.replaceState({}, '', '/auth/callback/google#id_token=tok-1')
        auth.loginWithGoogle.mockResolvedValue(undefined)
        render(<StrictMode><GoogleCallbackPage /></StrictMode>)
        await act(async () => {})
        expect(auth.loginWithGoogle).toHaveBeenCalledTimes(1)
        expect(auth.loginWithGoogle).toHaveBeenCalledWith('tok-1')
    })

    it('fails with a way back when Google sent no token', async () => {
        render(<GoogleCallbackPage />)
        expect(await screen.findByRole('alert')).toHaveTextContent('Google did not send a sign-in token.')
        expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/auth')
        expect(auth.loginWithGoogle).not.toHaveBeenCalled()
    })

    it('hands a second step to the sign-in page', async () => {
        nav.search = 'credential=cred-1'
        auth.loginWithGoogle.mockResolvedValue({ requires2FA: true, tempToken: 'temp-g' })
        render(<GoogleCallbackPage />)
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/auth'))
        expect(takePending2fa()).toBe('temp-g')
    })
})
