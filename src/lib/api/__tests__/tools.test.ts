import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchApi = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ fetchApi }))

import {
    checkSsl, checkTakeover, findSubdomains, getAdminToolStats, getCve, getToolCapabilities, getToolsRegistry,
    lookupDns, lookupIp, lookupWhois, scanHeaders, searchCves, testCors, updateAdminToolSettings,
} from '../tools'

const ok = (data: unknown, meta?: Record<string, unknown>) => ({ success: true, data, meta })
const lastBody = () => JSON.parse(fetchApi.mock.calls[fetchApi.mock.calls.length - 1][1].body)

beforeEach(() => { fetchApi.mockReset() })

describe('registry and capabilities', () => {
    it('reads the list without a token', async () => {
        fetchApi.mockResolvedValue(ok({ tools: [] }))
        await getToolsRegistry()
        expect(fetchApi).toHaveBeenCalledWith('/api/tools', { requireAuth: false })
    })

    it('reads the per-tool capabilities and returns just the tools map', async () => {
        fetchApi.mockResolvedValue(ok({ tools: { cve: { enabled: true } } }))
        expect(await getToolCapabilities()).toEqual({ cve: { enabled: true } })
        expect(fetchApi).toHaveBeenCalledWith('/api/tools/capabilities', { requireAuth: false })
    })
})

describe('passive tools', () => {
    it('searches CVEs with a trimmed keyword and only the params that matter', async () => {
        fetchApi.mockResolvedValue(ok({ items: [] }))
        await searchCves({ keyword: '  log4j ', severity: 'HIGH', page: 2, pageSize: 10 })
        expect(fetchApi).toHaveBeenCalledWith('/api/tools/cve?keyword=log4j&severity=HIGH&page=2&pageSize=10')
        await searchCves({ keyword: 'x', severity: '', page: 1 })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/tools/cve?keyword=x')
    })

    it('upper-cases and encodes a CVE id', async () => {
        fetchApi.mockResolvedValue(ok({ id: 'CVE-2021-44228' }))
        const result = await getCve(' cve-2021-44228 ')
        expect(fetchApi).toHaveBeenCalledWith('/api/tools/cve/CVE-2021-44228')
        expect(result.data.id).toBe('CVE-2021-44228')
        expect(result.meta.cached).toBe(false)
    })

    it('keeps the meta the API sends (cached, stale, quota)', async () => {
        fetchApi.mockResolvedValue(ok({ domain: 'example.com' }, { cached: true, stale: true, tookMs: 12, quota: { limit: 30, remaining: 29, resetSeconds: 3000 } }))
        const result = await lookupWhois('example.com')
        expect(result.meta).toEqual({ cached: true, stale: true, tookMs: 12, quota: { limit: 30, remaining: 29, resetSeconds: 3000 } })
    })

    it('sends whois, dns and ip queries encoded', async () => {
        fetchApi.mockResolvedValue(ok({}))
        await lookupWhois(' example.com ')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/tools/whois?domain=example.com')
        await lookupDns('example.com', ['A', 'MX'])
        expect(fetchApi).toHaveBeenLastCalledWith('/api/tools/dns?name=example.com&types=A%2CMX')
        await lookupDns('example.com')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/tools/dns?name=example.com')
        await lookupIp('2001:db8::1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/tools/ip?ip=2001%3Adb8%3A%3A1')
    })

    it('refuses an empty answer instead of rendering nothing', async () => {
        fetchApi.mockResolvedValue({ success: true })
        await expect(lookupIp('1.1.1.1')).rejects.toThrow(/empty answer/i)
    })

    it('passes API errors through untouched', async () => {
        const error = Object.assign(new Error('limit'), { code: 'TOOL_RATE_LIMITED' })
        fetchApi.mockRejectedValue(error)
        await expect(lookupDns('example.com')).rejects.toBe(error)
    })
})

describe('active tools', () => {
    it('always posts the acknowledgement', async () => {
        fetchApi.mockResolvedValue(ok({}))
        await scanHeaders({ url: ' https://example.com ', ack: true })
        expect(fetchApi.mock.calls[0][0]).toBe('/api/tools/headers')
        expect(fetchApi.mock.calls[0][1].method).toBe('POST')
        expect(lastBody()).toEqual({ url: 'https://example.com', ack: true })
    })

    it('sends cors origins trimmed, without blanks', async () => {
        fetchApi.mockResolvedValue(ok({}))
        await testCors({ url: 'https://example.com', origins: [' https://a.test ', ''], ack: true })
        expect(fetchApi.mock.calls[0][0]).toBe('/api/tools/cors')
        expect(lastBody()).toEqual({ url: 'https://example.com', origins: ['https://a.test'], ack: true })
    })

    it('sends subdomains, takeover and ssl bodies', async () => {
        fetchApi.mockResolvedValue(ok({}))
        await findSubdomains({ domain: ' example.com ', ack: true })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/tools/subdomains', expect.anything())
        expect(lastBody()).toEqual({ domain: 'example.com', ack: true })

        await checkTakeover({ domain: 'example.com', ack: true })
        expect(lastBody()).toEqual({ domain: 'example.com', ack: true })
        await checkTakeover({ subdomains: ['a.example.com', 'b.example.com'], ack: true })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/tools/takeover', expect.anything())
        expect(lastBody()).toEqual({ subdomains: ['a.example.com', 'b.example.com'], ack: true })

        await checkSsl({ host: ' example.com ', ack: true })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/tools/ssl', expect.anything())
        expect(lastBody()).toEqual({ host: 'example.com', ack: true })
        await checkSsl({ host: 'example.com', port: 8443, ack: true })
        expect(lastBody()).toEqual({ host: 'example.com', port: 8443, ack: true })
    })

    it('does not set a client timeout: a takeover run can take most of a minute', async () => {
        fetchApi.mockResolvedValue(ok({}))
        await checkTakeover({ domain: 'example.com', ack: true })
        const options = fetchApi.mock.calls[0][1]
        expect(options.signal).toBeUndefined()
    })
})

describe('admin', () => {
    it('patches settings', async () => {
        fetchApi.mockResolvedValue(ok({ masterEnabled: true, tools: [] }))
        await updateAdminToolSettings({ tools: { cve: { enabled: false } } })
        expect(fetchApi.mock.calls[0][0]).toBe('/api/admin/tools/settings')
        expect(fetchApi.mock.calls[0][1].method).toBe('PATCH')
        expect(lastBody()).toEqual({ tools: { cve: { enabled: false } } })
    })

    it('reads the stats whether the API sends objects or rows', async () => {
        fetchApi.mockResolvedValueOnce(ok({ days: 7, since: 's', tools: { dns: { ok: 3 } }, blockedReasons: { private: 2 } }))
        const asObjects = await getAdminToolStats(7)
        expect(fetchApi).toHaveBeenLastCalledWith('/api/admin/tools/stats?days=7')
        expect(asObjects.tools.dns).toEqual({ ok: 3, blocked: 0, error: 0, limited: 0, cached: 0 })
        expect(asObjects.blockedReasons).toEqual({ private: 2 })

        fetchApi.mockResolvedValueOnce(ok({ tools: [{ tool: 'ssl', ok: 1, error: 2 }], blockedReasons: [{ reason: 'loopback', count: 4 }] }))
        const asRows = await getAdminToolStats(30)
        expect(asRows.tools.ssl).toEqual({ ok: 1, blocked: 0, error: 2, limited: 0, cached: 0 })
        expect(asRows.blockedReasons).toEqual({ loopback: 4 })
        expect(asRows.days).toBe(30)
    })
})
