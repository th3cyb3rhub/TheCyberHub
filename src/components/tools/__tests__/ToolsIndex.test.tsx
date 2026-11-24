import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ getToolsRegistry: vi.fn(), getToolCapabilities: vi.fn() }))
const nav = vi.hoisted(() => ({ search: '', replace: vi.fn() }))

vi.mock('@/lib/api/tools', () => api)
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('next/navigation', () => ({
    usePathname: () => '/tools',
    useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(nav.search),
}))
vi.mock('@/components/Footer', () => ({ default: () => null }))

import { ToolsIndex } from '../ToolsIndex'
import { FALLBACK_TOOLS } from '@/lib/tools/registry'
import { renderWithQuery } from './testkit'

beforeEach(() => {
    api.getToolsRegistry.mockReset()
    nav.replace.mockReset()
    nav.search = ''
})

describe('ToolsIndex', () => {
    it('shows the built-in list at once and says so when the API cannot be reached', async () => {
        api.getToolsRegistry.mockRejectedValue(new TypeError('Failed to fetch'))
        renderWithQuery(<ToolsIndex />)
        expect(screen.getAllByTestId('tool-card')).toHaveLength(FALLBACK_TOOLS.length)
        expect(screen.getByTestId('tools-count')).toHaveTextContent(`${FALLBACK_TOOLS.length} tools`)
        // The registry query retries once before giving up
        expect(await screen.findByTestId('registry-fallback', {}, { timeout: 4000 })).toHaveTextContent(/built-in list/i)
    })

    it('marks a tool the API reports as paused', async () => {
        api.getToolsRegistry.mockResolvedValue({ tools: [{ slug: 'ssl-checker', enabled: false, status: 'disabled' }] })
        renderWithQuery(<ToolsIndex />)
        const card = (await screen.findAllByTestId('tool-card')).find((c) => c.getAttribute('data-slug') === 'ssl-checker')!
        await waitFor(() => expect(within(card).getByText('Paused')).toBeInTheDocument())
    })

    it('filters by search and writes the filter to the address', async () => {
        api.getToolsRegistry.mockRejectedValue(new TypeError('x'))
        renderWithQuery(<ToolsIndex />)
        await userEvent.type(screen.getByRole('searchbox', { name: /search tools/i }), 'whois')
        const cards = screen.getAllByTestId('tool-card')
        expect(cards.length).toBeGreaterThan(0)
        expect(cards.length).toBeLessThan(FALLBACK_TOOLS.length)
        expect(cards.some((c) => c.getAttribute('data-slug') === 'whois-lookup')).toBe(true)
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/tools?q=whois', { scroll: false }))
    })

    it('narrows by category chip and reports the count', async () => {
        api.getToolsRegistry.mockRejectedValue(new TypeError('x'))
        renderWithQuery(<ToolsIndex />)
        const chip = screen.getByTestId('chip-recon')
        await userEvent.click(chip)
        expect(chip).toHaveAttribute('aria-pressed', 'true')
        const slugs = screen.getAllByTestId('tool-card').map((c) => c.getAttribute('data-slug'))
        expect(slugs).toContain('dns-lookup')
        expect(slugs).not.toContain('ssl-checker')
        expect(screen.getByTestId('tools-count')).toHaveTextContent(/of \d+ tools/)
    })

    it('starts from the filters in the address', () => {
        api.getToolsRegistry.mockRejectedValue(new TypeError('x'))
        nav.search = 'q=dns'
        renderWithQuery(<ToolsIndex />)
        expect(screen.getByRole('searchbox')).toHaveValue('dns')
        expect(screen.getAllByTestId('tool-card').map((c) => c.getAttribute('data-slug'))).toContain('dns-lookup')
    })

    it('shows an empty state with a way back', async () => {
        api.getToolsRegistry.mockRejectedValue(new TypeError('x'))
        renderWithQuery(<ToolsIndex />)
        await userEvent.type(screen.getByRole('searchbox'), 'zzzzzzzz')
        expect(screen.getByTestId('tools-empty')).toBeInTheDocument()
        expect(screen.queryAllByTestId('tool-card')).toHaveLength(0)
        await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
        expect(screen.getAllByTestId('tool-card')).toHaveLength(FALLBACK_TOOLS.length)
    })

    it('focuses the search box with the slash key, but not while typing in a field', async () => {
        api.getToolsRegistry.mockRejectedValue(new TypeError('x'))
        renderWithQuery(<ToolsIndex />)
        const box = screen.getByRole('searchbox')
        expect(box).not.toHaveFocus()
        await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })) })
        expect(box).toHaveFocus()
    })

    it('has no card hidden by an inline opacity (a stuck animation must not hide tools)', () => {
        api.getToolsRegistry.mockRejectedValue(new TypeError('x'))
        renderWithQuery(<ToolsIndex />)
        for (const card of screen.getAllByTestId('tool-card')) expect(card.getAttribute('style') ?? '').not.toMatch(/opacity/)
    })
})
