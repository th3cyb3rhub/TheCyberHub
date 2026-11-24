import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
    getToolsRegistry: vi.fn(), getToolCapabilities: vi.fn(),
    getAdminToolSettings: vi.fn(), updateAdminToolSettings: vi.fn(), getAdminToolStats: vi.fn(),
}))
const auth = vi.hoisted(() => ({ value: { user: null as null | { id: string; role: string }, loading: false } }))
const replace = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api/tools', () => api)
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.value }))
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/tools', useRouter: () => ({ replace, push: vi.fn() }) }))

import { AdminToolsView } from '../AdminToolsView'
import { apiError, renderWithQuery } from './testkit'

const settings = (over: Record<string, unknown> = {}) => ({
    masterEnabled: true,
    activeToolsAllowed: false,
    tools: [
        { id: 'cve', mode: 'passive', enabled: true, reason: null, dailyCap: null, defaultDailyCap: 5000, usedToday: 120 },
        { id: 'ssl', mode: 'active', enabled: false, reason: 'active_off', dailyCap: 100, defaultDailyCap: 500, usedToday: 95 },
        { id: 'dns', mode: 'passive', enabled: false, reason: 'admin_off', dailyCap: null, defaultDailyCap: 5000, usedToday: 0 },
    ],
    blockedTargets: ['optout.example'],
    ...over,
})

beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset())
    replace.mockReset()
    auth.value = { user: { id: 'a1', role: 'admin' }, loading: false }
    api.getAdminToolSettings.mockResolvedValue(settings())
    api.getAdminToolStats.mockResolvedValue({ days: 7, since: '', tools: { cve: { ok: 10, blocked: 0, error: 1, limited: 2, cached: 5 } }, blockedReasons: { private: 3 } })
})

describe('AdminToolsView access', () => {
    it('does not call the API for a regular member and says why', async () => {
        auth.value = { user: { id: 'u1', role: 'user' }, loading: false }
        renderWithQuery(<AdminToolsView />)
        expect(await screen.findByText(/only administrators/i)).toBeInTheDocument()
        expect(api.getAdminToolSettings).not.toHaveBeenCalled()
        expect(api.getAdminToolStats).not.toHaveBeenCalled()
    })

    it('does not give a moderator the controls either', async () => {
        auth.value = { user: { id: 'm1', role: 'moderator' }, loading: false }
        renderWithQuery(<AdminToolsView />)
        expect(await screen.findByText(/only administrators/i)).toBeInTheDocument()
        expect(api.getAdminToolSettings).not.toHaveBeenCalled()
    })

    it('sends a signed-out visitor to sign in and back here', async () => {
        auth.value = { user: null, loading: false }
        renderWithQuery(<AdminToolsView />)
        await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Fadmin%2Ftools'))
        expect(api.getAdminToolSettings).not.toHaveBeenCalled()
    })

    it('waits while the account is loading', () => {
        auth.value = { user: null, loading: true }
        renderWithQuery(<AdminToolsView />)
        expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
        expect(replace).not.toHaveBeenCalled()
    })
})

describe('AdminToolsView', () => {
    it('lists each tool with its state, use and the reason it is off', async () => {
        renderWithQuery(<AdminToolsView />)
        const rows = await screen.findAllByTestId('admin-tool-row')
        expect(rows).toHaveLength(3)
        const ssl = rows.find((r) => r.getAttribute('data-tool') === 'ssl')!
        expect(within(ssl).getByText('Paused')).toBeInTheDocument()
        expect(within(ssl).getByTestId('used-today')).toHaveTextContent('95 of 100')
        expect(within(ssl).getByText(/cannot be changed here/i)).toBeInTheDocument()
        // A reason that comes from the server's environment cannot be flipped from the screen
        expect(within(ssl).getByRole('button', { name: /resume/i })).toBeDisabled()
        const dns = rows.find((r) => r.getAttribute('data-tool') === 'dns')!
        expect(within(dns).getByRole('button', { name: /resume/i })).toBeEnabled()
        expect(screen.getByText(/off in this environment/i)).toBeInTheDocument()
    })

    it('asks before pausing, then sends the change and confirms it', async () => {
        api.updateAdminToolSettings.mockResolvedValue(settings())
        renderWithQuery(<AdminToolsView />)
        await userEvent.click(await screen.findByRole('button', { name: /pause cve search/i }))
        expect(api.updateAdminToolSettings).not.toHaveBeenCalled()
        await userEvent.click(screen.getByRole('button', { name: 'Pause tool' }))
        await waitFor(() => expect(api.updateAdminToolSettings).toHaveBeenCalledWith({ tools: { cve: { enabled: false } } }, expect.anything()))
        expect(await screen.findByText(/cve search is paused/i)).toBeInTheDocument()
    })

    it('does not pause when the dialog is cancelled', async () => {
        renderWithQuery(<AdminToolsView />)
        await userEvent.click(await screen.findByRole('button', { name: /pause cve search/i }))
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(api.updateAdminToolSettings).not.toHaveBeenCalled()
    })

    it('resumes a paused tool without asking', async () => {
        api.updateAdminToolSettings.mockResolvedValue(settings())
        renderWithQuery(<AdminToolsView />)
        await userEvent.click(await screen.findByRole('button', { name: /resume dns lookup/i }))
        await waitFor(() => expect(api.updateAdminToolSettings).toHaveBeenCalledWith({ tools: { dns: { enabled: true } } }, expect.anything()))
    })

    it('validates a cap before sending it, and sends null to go back to the default', async () => {
        api.updateAdminToolSettings.mockResolvedValue(settings())
        renderWithQuery(<AdminToolsView />)
        const field = await screen.findByLabelText(/daily cap \(default 5,000\)/i, { selector: '#cap-cve' })
        await userEvent.type(field, '12x')
        await userEvent.click(within(field.closest('li')!).getByRole('button', { name: 'Save' }))
        expect(await screen.findByText(/whole number from 0 to 1,000,000/i)).toBeInTheDocument()
        expect(api.updateAdminToolSettings).not.toHaveBeenCalled()

        await userEvent.clear(field)
        await userEvent.type(field, '250')
        await userEvent.click(within(field.closest('li')!).getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(api.updateAdminToolSettings).toHaveBeenCalledWith({ tools: { cve: { dailyCap: 250 } } }, expect.anything()))

        const ssl = document.querySelector('#cap-ssl') as HTMLInputElement
        await userEvent.clear(ssl)
        await userEvent.click(within(ssl.closest('li')!).getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(api.updateAdminToolSettings).toHaveBeenCalledWith({ tools: { ssl: { dailyCap: null } } }, expect.anything()))
    })

    it('adds and removes blocked targets, normalising the domain', async () => {
        api.updateAdminToolSettings.mockResolvedValue(settings())
        renderWithQuery(<AdminToolsView />)
        await userEvent.type(await screen.findByLabelText('Domain to block'), 'https://Blocked.Example/path')
        await userEvent.click(screen.getByRole('button', { name: /^block$/i }))
        await waitFor(() => expect(api.updateAdminToolSettings).toHaveBeenCalledWith({ blockedTargets: ['optout.example', 'blocked.example'] }, expect.anything()))

        await userEvent.click(screen.getByRole('button', { name: 'Unblock optout.example' }))
        await waitFor(() => expect(api.updateAdminToolSettings).toHaveBeenCalledWith({ blockedTargets: [] }, expect.anything()))
    })

    it('refuses a duplicate or invalid blocked domain', async () => {
        renderWithQuery(<AdminToolsView />)
        const field = await screen.findByLabelText('Domain to block')
        await userEvent.type(field, 'optout.example')
        await userEvent.click(screen.getByRole('button', { name: /^block$/i }))
        expect(await screen.findByText(/already blocked/i)).toBeInTheDocument()
        await userEvent.clear(field)
        await userEvent.type(field, 'not a domain')
        await userEvent.click(screen.getByRole('button', { name: /^block$/i }))
        expect(await screen.findByRole('alert')).toBeInTheDocument()
        expect(api.updateAdminToolSettings).not.toHaveBeenCalled()
    })

    it('shows the usage table and why targets were blocked', async () => {
        renderWithQuery(<AdminToolsView />)
        const table = await screen.findByTestId('stats-table')
        expect(within(table).getByText('CVE Search')).toBeInTheDocument()
        expect(screen.getByTestId('blocked-reasons')).toHaveTextContent('private: 3')
        await userEvent.selectOptions(screen.getByLabelText('Period'), '30')
        await waitFor(() => expect(api.getAdminToolStats).toHaveBeenCalledWith(30))
    })

    it('says so when there were no runs', async () => {
        api.getAdminToolStats.mockResolvedValue({ days: 7, since: '', tools: {}, blockedReasons: {} })
        renderWithQuery(<AdminToolsView />)
        expect(await screen.findByTestId('no-stats')).toBeInTheDocument()
    })

    it('shows a failed load with a retry, and a failed save as an error', async () => {
        api.getAdminToolSettings.mockRejectedValueOnce(apiError(403, 'FORBIDDEN', 'Forbidden')).mockResolvedValue(settings())
        renderWithQuery(<AdminToolsView />)
        const error = await screen.findByTestId('admin-tools-error')
        await userEvent.click(within(error).getByRole('button', { name: 'Try again' }))
        expect(await screen.findAllByTestId('admin-tool-row')).toHaveLength(3)

        api.updateAdminToolSettings.mockRejectedValue(apiError(400, 'VALIDATION_ERROR', 'Bad cap'))
        await userEvent.click(screen.getByRole('button', { name: /resume dns lookup/i }))
        expect(await screen.findByText(/Check the input/)).toBeInTheDocument()
    })
})
