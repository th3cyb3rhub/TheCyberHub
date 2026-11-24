import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
    getToolsRegistry: vi.fn(),
    getToolCapabilities: vi.fn(),
    searchCves: vi.fn(),
    getCve: vi.fn(),
    lookupWhois: vi.fn(),
    lookupDns: vi.fn(),
    lookupIp: vi.fn(),
    scanHeaders: vi.fn(),
    testCors: vi.fn(),
    findSubdomains: vi.fn(),
    checkTakeover: vi.fn(),
    checkSsl: vi.fn(),
    getAdminToolSettings: vi.fn(),
    updateAdminToolSettings: vi.fn(),
    getAdminToolStats: vi.fn(),
}))
const auth = vi.hoisted(() => ({
    value: { user: null as null | { id: string; isVerified?: boolean }, loading: false, requestVerification: vi.fn() },
}))

vi.mock('@/lib/api/tools', () => api)
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.value }))
vi.mock('next/navigation', () => ({ usePathname: () => '/tools/x', useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/Footer', () => ({ default: () => null }))

import HeaderAnalyzerPage from '@/app/tools/header-analyzer/page'
import WhoisPage from '@/app/tools/whois-lookup/page'
import DnsPage from '@/app/tools/dns-lookup/page'
import CveSearchPage from '@/app/tools/cve-search/page'
import TakeoverPage from '@/app/tools/sub-takeover/page'
import { apiError, renderWithQuery } from './testkit'

const headersResult = {
    requestedUrl: 'https://example.com/', finalUrl: 'https://example.com/', status: 200, statusText: 'OK', redirects: [],
    headers: [{ name: 'server', value: 'nginx' }],
    checks: [
        { id: 'hsts', header: 'strict-transport-security', status: 'pass', message: 'HSTS is set.' },
        { id: 'csp', header: 'content-security-policy', status: 'fail', message: 'No Content-Security-Policy.' },
    ],
    summary: { pass: 1, warn: 0, fail: 1, info: 0, na: 0 }, cookies: [], scannedAt: '2026-11-24T10:00:00.000Z',
}

beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset())
    // The live list is unreachable: pages use the built-in list, so every tool is available unless a test says otherwise
    api.getToolsRegistry.mockRejectedValue(new TypeError('Failed to fetch'))
    api.getToolCapabilities.mockResolvedValue({})
    auth.value = { user: null, loading: false, requestVerification: vi.fn().mockResolvedValue(undefined) }
    window.history.replaceState(null, '', '/')
})

describe('header analyzer: sign-in, verification and acknowledgement', () => {
    it('asks a signed-out visitor to sign in and does not call the API', async () => {
        renderWithQuery(<HeaderAnalyzerPage />)
        expect(await screen.findByTestId('login-gate')).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: /url to check/i })).toBeDisabled()
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', expect.stringContaining('/auth?redirect='))
        expect(api.scanHeaders).not.toHaveBeenCalled()
    })

    it('asks an unverified account to verify, and can send the link again', async () => {
        auth.value.user = { id: 'u1', isVerified: false }
        renderWithQuery(<HeaderAnalyzerPage />)
        expect(await screen.findByTestId('verify-gate')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: /send the link again/i }))
        expect(auth.value.requestVerification).toHaveBeenCalledTimes(1)
        expect(await screen.findByText(/we sent you a new link/i)).toBeInTheDocument()
        expect(api.scanHeaders).not.toHaveBeenCalled()
    })

    it('keeps the run button off until the visitor confirms they may test the target', async () => {
        auth.value.user = { id: 'u1', isVerified: true }
        renderWithQuery(<HeaderAnalyzerPage />)
        const run = await screen.findByRole('button', { name: /analyze headers/i })
        await userEvent.type(screen.getByRole('textbox', { name: /url to check/i }), 'https://example.com')
        expect(run).toBeDisabled()
        await userEvent.click(screen.getByRole('checkbox', { name: /i own this target/i }))
        expect(run).toBeEnabled()
    })

    it('refuses an address that is not http or https before calling the API', async () => {
        auth.value.user = { id: 'u1', isVerified: true }
        renderWithQuery(<HeaderAnalyzerPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /url to check/i }), 'ftp://example.com')
        await userEvent.click(screen.getByRole('checkbox', { name: /i own this target/i }))
        await userEvent.click(screen.getByRole('button', { name: /analyze headers/i }))
        expect(await screen.findByRole('alert')).toBeInTheDocument()
        expect(api.scanHeaders).not.toHaveBeenCalled()
    })

    it('sends the acknowledgement and shows the findings, failures first, with cache and quota', async () => {
        auth.value.user = { id: 'u1', isVerified: true }
        api.scanHeaders.mockResolvedValue({ data: headersResult, meta: { cached: true, tookMs: 80, quota: { limit: 30, remaining: 12, resetSeconds: 600 } } })
        renderWithQuery(<HeaderAnalyzerPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /url to check/i }), 'https://example.com')
        await userEvent.click(screen.getByRole('checkbox', { name: /i own this target/i }))
        await userEvent.click(screen.getByRole('button', { name: /analyze headers/i }))

        await waitFor(() => expect(api.scanHeaders).toHaveBeenCalledWith({ url: 'https://example.com', ack: true }, expect.anything()))
        const checks = await screen.findAllByTestId('header-check')
        expect(checks.map((c) => c.getAttribute('data-status'))).toEqual(['fail', 'pass'])
        expect(screen.getByText('Cached')).toBeInTheDocument()
        expect(screen.getByTestId('quota')).toHaveTextContent('12 of 30 runs left')
        expect(screen.getByRole('button', { name: /copy summary/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /download json/i })).toBeInTheDocument()
        expect(screen.getByText(/there is no overall grade/i)).toBeInTheDocument()
    })

    it('shows a rate limit with a countdown and a disabled retry', async () => {
        auth.value.user = { id: 'u1', isVerified: true }
        api.scanHeaders.mockRejectedValue(apiError(429, 'TOOL_RATE_LIMITED', 'x', { scope: 'hour', retryAfter: 90 }))
        renderWithQuery(<HeaderAnalyzerPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /url to check/i }), 'https://example.com')
        await userEvent.click(screen.getByRole('checkbox', { name: /i own this target/i }))
        await userEvent.click(screen.getByRole('button', { name: /analyze headers/i }))
        const error = await screen.findByTestId('tool-error')
        expect(error).toHaveAttribute('data-kind', 'rate_limited')
        expect(within(error).getByText(/hourly limit/i)).toBeInTheDocument()
        expect(within(error).getByRole('button', { name: /try again in 2 minutes/i })).toBeDisabled()
    })

    it('shows a blocked target with its reason and no retry', async () => {
        auth.value.user = { id: 'u1', isVerified: true }
        api.scanHeaders.mockRejectedValue(apiError(422, 'TOOL_TARGET_BLOCKED', 'x', { reason: 'loopback' }))
        renderWithQuery(<HeaderAnalyzerPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /url to check/i }), 'http://localhost:8080')
        await userEvent.click(screen.getByRole('checkbox', { name: /i own this target/i }))
        await userEvent.click(screen.getByRole('button', { name: /analyze headers/i }))
        const error = await screen.findByTestId('tool-error')
        expect(error).toHaveAttribute('data-kind', 'blocked')
        expect(within(error).getByText(/loopback address/i)).toBeInTheDocument()
        expect(within(error).getByText('Reason: loopback')).toBeInTheDocument()
        expect(within(error).queryByRole('button')).not.toBeInTheDocument()
    })

    it('says the tool is paused, with the API reason, and disables the form', async () => {
        auth.value.user = { id: 'u1', isVerified: true }
        api.getToolCapabilities.mockResolvedValue({ headers: { enabled: false, reason: 'active_off' } })
        renderWithQuery(<HeaderAnalyzerPage />)
        const notice = await screen.findByTestId('paused-notice')
        expect(notice).toHaveTextContent(/not switched on in this environment/i)
        expect(screen.getByRole('textbox', { name: /url to check/i })).toBeDisabled()
    })
})

describe('whois lookup', () => {
    const whois = { domain: 'example.com', registrar: 'Example Registrar', status: ['client transfer prohibited'], created: '1995-08-14T00:00:00Z', expires: '2099-08-13T00:00:00Z', updated: null, nameservers: ['a.iana-servers.net'], dnssec: true, source: 'rdap' }

    it('works without an account and shows the result', async () => {
        api.lookupWhois.mockResolvedValue({ data: whois, meta: { cached: true } })
        renderWithQuery(<WhoisPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /domain name/i }), 'https://Example.com/path')
        await userEvent.click(screen.getByRole('button', { name: /look up/i }))
        await waitFor(() => expect(api.lookupWhois).toHaveBeenCalledWith('example.com'))
        expect(await screen.findByText('Example Registrar')).toBeInTheDocument()
        expect(screen.getByText('a.iana-servers.net')).toBeInTheDocument()
        expect(screen.getByText('Cached')).toBeInTheDocument()
    })

    it('flags a stale copy', async () => {
        api.lookupWhois.mockResolvedValue({ data: whois, meta: { cached: true, stale: true } })
        renderWithQuery(<WhoisPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /domain name/i }), 'example.com')
        await userEvent.click(screen.getByRole('button', { name: /look up/i }))
        expect(await screen.findByText(/stale copy/i)).toBeInTheDocument()
    })

    it('rejects input that is not a domain without calling the API', async () => {
        renderWithQuery(<WhoisPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /domain name/i }), 'not a domain')
        await userEvent.click(screen.getByRole('button', { name: /look up/i }))
        expect(await screen.findByRole('alert')).toBeInTheDocument()
        expect(api.lookupWhois).not.toHaveBeenCalled()
    })

    it('shows not found as an answer, not a failure to retry', async () => {
        api.lookupWhois.mockRejectedValue(apiError(404, 'TOOL_NOT_FOUND', 'No registration found for this domain'))
        renderWithQuery(<WhoisPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /domain name/i }), 'nope.example')
        await userEvent.click(screen.getByRole('button', { name: /look up/i }))
        const error = await screen.findByTestId('tool-error')
        expect(error).toHaveAttribute('data-kind', 'not_found')
        expect(within(error).getByText('No registration found for this domain')).toBeInTheDocument()
        expect(within(error).queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
    })

    it('lets a busy data source be tried again', async () => {
        api.lookupWhois.mockRejectedValueOnce(apiError(503, 'TOOL_UPSTREAM_BUSY')).mockResolvedValueOnce({ data: whois, meta: { cached: false } })
        renderWithQuery(<WhoisPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /domain name/i }), 'example.com')
        await userEvent.click(screen.getByRole('button', { name: /look up/i }))
        const retry = await screen.findByRole('button', { name: 'Try again' })
        await userEvent.click(retry)
        expect(await screen.findByText('Example Registrar')).toBeInTheDocument()
        expect(api.lookupWhois).toHaveBeenCalledTimes(2)
    })

    it('says a paused tool is paused', async () => {
        api.getToolCapabilities.mockResolvedValue({ whois: { enabled: false, reason: 'daily_cap' } })
        renderWithQuery(<WhoisPage />)
        expect(await screen.findByTestId('paused-notice')).toHaveTextContent(/daily limit/i)
        expect(screen.getByRole('textbox', { name: /domain name/i })).toBeDisabled()
    })
})

describe('dns lookup', () => {
    it('shows a failed record type as a failure, never as empty', async () => {
        api.lookupDns.mockResolvedValue({
            data: {
                name: 'example.com', kind: 'domain', exists: null,
                results: {
                    A: { status: 'ok', records: [{ value: '93.184.216.34', ttl: 300 }] },
                    MX: { status: 'error', records: [], error: 'timeout' },
                    TXT: { status: 'empty', records: [] },
                },
            },
            meta: { cached: false },
        })
        renderWithQuery(<DnsPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /domain name or ip/i }), 'example.com')
        await userEvent.click(screen.getByRole('button', { name: /look up/i }))
        expect(await screen.findByTestId('dns-A')).toHaveAttribute('data-status', 'ok')
        expect(screen.getByTestId('dns-MX')).toHaveAttribute('data-status', 'error')
        expect(within(screen.getByTestId('dns-MX')).getByText(/not the same as having no records/i)).toBeInTheDocument()
        expect(screen.getByTestId('dns-TXT')).toHaveAttribute('data-status', 'empty')
        expect(screen.getByText('Existence unknown')).toBeInTheDocument()
        expect(screen.getByText('93.184.216.34')).toBeInTheDocument()
    })
})

describe('cve search', () => {
    it('opens the full record for a CVE id', async () => {
        api.getCve.mockResolvedValue({
            data: { id: 'CVE-2021-44228', summary: 'Log4Shell', cvss: { score: 10, severity: 'CRITICAL' }, published: '2021-12-10T00:00:00Z', modified: null, status: 'Analyzed', cwe: ['CWE-502'], refs: [], knownExploited: { name: 'Log4j', addedOn: null, dueDate: null, requiredAction: null }, source: 'nvd' },
            meta: { cached: false },
        })
        renderWithQuery(<CveSearchPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /cve id or keyword/i }), 'cve-2021-44228')
        await userEvent.click(screen.getByRole('button', { name: /search/i }))
        await waitFor(() => expect(api.getCve).toHaveBeenCalledWith('CVE-2021-44228'))
        expect(await screen.findByText('Log4Shell')).toBeInTheDocument()
        expect(screen.getAllByText(/known exploited/i).length).toBeGreaterThan(0)
    })

    it('searches by keyword with the chosen severity', async () => {
        api.searchCves.mockResolvedValue({ data: { items: [{ id: 'CVE-2021-44228', summary: 'Log4Shell', cvss: { score: 10, severity: 'CRITICAL' }, published: null, knownExploited: true }], total: 1, page: 1, pageSize: 20, source: 'nvd' }, meta: { cached: false } })
        renderWithQuery(<CveSearchPage />)
        await userEvent.selectOptions(await screen.findByLabelText(/severity/i), 'CRITICAL')
        await userEvent.type(screen.getByRole('textbox', { name: /cve id or keyword/i }), 'log4j')
        await userEvent.click(screen.getByRole('button', { name: /search/i }))
        await waitFor(() => expect(api.searchCves).toHaveBeenCalledWith({ keyword: 'log4j', severity: 'CRITICAL', page: 1 }))
        expect(await screen.findByText('CVE-2021-44228')).toBeInTheDocument()
    })

    it('shows an empty search honestly', async () => {
        api.searchCves.mockResolvedValue({ data: { items: [], total: 0, page: 1, pageSize: 20, source: 'nvd' }, meta: { cached: false } })
        renderWithQuery(<CveSearchPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /cve id or keyword/i }), 'zzzzzz')
        await userEvent.click(screen.getByRole('button', { name: /search/i }))
        expect(await screen.findByText(/no (cves|results|matching)/i)).toBeInTheDocument()
    })

    it('shows an upstream problem as a problem, not as an empty result', async () => {
        api.searchCves.mockRejectedValue(apiError(502, 'TOOL_UPSTREAM_ERROR'))
        renderWithQuery(<CveSearchPage />)
        await userEvent.type(await screen.findByRole('textbox', { name: /cve id or keyword/i }), 'log4j')
        await userEvent.click(screen.getByRole('button', { name: /search/i }))
        const error = await screen.findByTestId('tool-error')
        expect(error).toHaveAttribute('data-kind', 'upstream')
        expect(within(error).getByText(/not a result/i)).toBeInTheDocument()
    })
})

describe('subdomain takeover', () => {
    it('tells the visitor it can take up to a minute while it runs, and sends the ack', async () => {
        auth.value.user = { id: 'u1', isVerified: true }
        let finish: (value: unknown) => void = () => {}
        api.checkTakeover.mockReturnValue(new Promise((resolve) => { finish = resolve }))
        renderWithQuery(<TakeoverPage />)
        await userEvent.type(await screen.findByRole('textbox'), 'example.com')
        await userEvent.click(screen.getByRole('checkbox', { name: /i own this target/i }))
        await userEvent.click(screen.getByRole('button', { name: /check/i }))
        expect(await screen.findByText(/up to a minute/i)).toBeInTheDocument()
        expect(api.checkTakeover).toHaveBeenCalledWith({ domain: 'example.com', ack: true }, expect.anything())
        finish({ data: { scope: 'example.com', mode: 'domain', checked: 0, totalFound: 0, truncated: false, counts: {}, results: [], note: '', scannedAt: '2026-11-24T10:00:00.000Z' }, meta: { cached: false } })
        await waitFor(() => expect(screen.queryByText(/up to a minute/i)).not.toBeInTheDocument())
    })

    it('shows a whole-run timeout and lets the visitor try again', async () => {
        auth.value.user = { id: 'u1', isVerified: true }
        api.checkTakeover.mockRejectedValue(apiError(504, 'TOOL_UPSTREAM_TIMEOUT'))
        renderWithQuery(<TakeoverPage />)
        await userEvent.type(await screen.findByRole('textbox'), 'example.com')
        await userEvent.click(screen.getByRole('checkbox', { name: /i own this target/i }))
        await userEvent.click(screen.getByRole('button', { name: /check/i }))
        const error = await screen.findByTestId('tool-error')
        expect(error).toHaveAttribute('data-kind', 'timeout')
        expect(within(error).getByRole('button', { name: 'Try again' })).toBeEnabled()
    })
})
