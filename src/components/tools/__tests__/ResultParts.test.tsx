import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/tools/whois-lookup' }))

import { CopyButton, ResultMeta, ToolErrorPanel } from '../ResultParts'
import { apiError } from './testkit'

describe('ToolErrorPanel', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('counts a rate limit down and enables the retry button when the wait is over', () => {
        const onRetry = vi.fn()
        render(<ToolErrorPanel error={apiError(429, 'TOOL_RATE_LIMITED', 'x', { scope: 'minute', retryAfter: 3 })} onRetry={onRetry} />)
        const button = screen.getByRole('button', { name: /try again in 3 seconds/i })
        expect(button).toBeDisabled()
        expect(screen.queryByTestId('retry-countdown')).not.toBeInTheDocument()
        expect(screen.getAllByText(/try again in/i)).toHaveLength(1)

        act(() => { vi.advanceTimersByTime(1000) })
        expect(screen.getByRole('button', { name: /try again in 2 seconds/i })).toBeDisabled()

        act(() => { vi.advanceTimersByTime(2000) })
        const ready = screen.getByRole('button', { name: 'Try again' })
        expect(ready).toBeEnabled()
        expect(screen.queryByTestId('retry-countdown')).not.toBeInTheDocument()
    })

    it('shows the reason a target was blocked and offers no retry', () => {
        render(<ToolErrorPanel error={apiError(422, 'TOOL_TARGET_BLOCKED', 'x', { reason: 'private' })} onRetry={vi.fn()} />)
        expect(screen.getByRole('alert')).toHaveAttribute('data-kind', 'blocked')
        expect(screen.getByText(/private network address/i)).toBeInTheDocument()
        expect(screen.getByText('Reason: private')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
    })

    it('points a signed-out visitor to sign in, back to this page', () => {
        render(<ToolErrorPanel error={apiError(401, 'AUTH_TOKEN_INVALID')} onRetry={vi.fn()} />)
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth?redirect=%2Ftools%2Fwhois-lookup')
    })

    it('explains the network and daily-share limits', () => {
        const { rerender } = render(<ToolErrorPanel error={apiError(429, 'TOOL_RATE_LIMITED', 'x', { scope: 'network', retryAfter: 120 })} onRetry={vi.fn()} />)
        expect(screen.getByText(/your network/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /try again in 2 minutes/i })).toBeDisabled()
        rerender(<ToolErrorPanel error={apiError(429, 'TOOL_RATE_LIMITED', 'x', { scope: 'user_daily', retryAfter: 3600 })} onRetry={vi.fn()} />)
        expect(screen.getByText(/your share of this tool for today/i)).toBeInTheDocument()
    })

    it('lets a plain failure be retried at once', async () => {
        vi.useRealTimers()
        const onRetry = vi.fn()
        render(<ToolErrorPanel error={apiError(504, 'TOOL_UPSTREAM_TIMEOUT')} onRetry={onRetry} />)
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('says so when the server cannot be reached', () => {
        render(<ToolErrorPanel error={new TypeError('Failed to fetch')} onRetry={vi.fn()} />)
        expect(screen.getByText('Could not reach the server')).toBeInTheDocument()
    })
})

describe('ResultMeta', () => {
    it('shows cached, took, and quota', () => {
        render(<ResultMeta meta={{ cached: true, tookMs: 42, quota: { limit: 30, remaining: 7, resetSeconds: 1800 } }} />)
        expect(screen.getByText('Cached')).toBeInTheDocument()
        expect(screen.getByText('42 ms')).toBeInTheDocument()
        expect(screen.getByTestId('quota')).toHaveTextContent('7 of 30 runs left this hour (resets in 30 minutes)')
    })

    it('says a stale copy is stale instead of cached', () => {
        render(<ResultMeta meta={{ cached: true, stale: true }} />)
        expect(screen.getByText(/stale copy/i)).toBeInTheDocument()
        expect(screen.queryByText('Cached')).not.toBeInTheDocument()
    })

    it('shows nothing extra for a fresh answer without quota', () => {
        render(<ResultMeta meta={{ cached: false }} />)
        expect(screen.queryByText('Cached')).not.toBeInTheDocument()
        expect(screen.queryByTestId('quota')).not.toBeInTheDocument()
    })
})

describe('CopyButton', () => {
    it('reports a copy and a refused clipboard', async () => {
        const user = userEvent.setup()
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        render(<CopyButton text="hello" label="Copy JSON" />)
        await user.click(screen.getByRole('button', { name: 'Copy JSON' }))
        expect(writeText).toHaveBeenCalledWith('hello')
        expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()

        writeText.mockRejectedValue(new Error('denied'))
        const second = render(<CopyButton text="x" />)
        await user.click(second.getByRole('button', { name: 'Copy' }))
        expect(await second.findByRole('button', { name: 'Copy failed' })).toBeInTheDocument()
    })
})
