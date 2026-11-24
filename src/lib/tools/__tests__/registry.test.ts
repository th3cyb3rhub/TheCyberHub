import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import sitemap from '@/app/sitemap'
import {
    CATEGORIES, countByFilter, FALLBACK_REGISTRY, FALLBACK_TOOLS, filterTools, matchesQuery, mergeRegistry, parseToolFilters,
    popularTools, relatedLinks, toolFilterQuery, toolHref, trustKind,
} from '../registry'

const TOOLS_DIR = join(process.cwd(), 'src', 'app', 'tools')
const folders = readdirSync(TOOLS_DIR).filter((name) => statSync(join(TOOLS_DIR, name)).isDirectory() && existsSync(join(TOOLS_DIR, name, 'page.tsx')))

describe('registry and the tool folders', () => {
    it('lists exactly the tools that have a page', () => {
        expect(FALLBACK_TOOLS.map((t) => t.slug).sort()).toEqual([...folders].sort())
    })

    it('has unique slugs and ids and only known categories', () => {
        const slugs = FALLBACK_TOOLS.map((t) => t.slug)
        const ids = FALLBACK_TOOLS.map((t) => t.id)
        expect(new Set(slugs).size).toBe(slugs.length)
        expect(new Set(ids).size).toBe(ids.length)
        const known = new Set(CATEGORIES.map((c) => c.id))
        for (const tool of FALLBACK_TOOLS) expect(known.has(tool.category)).toBe(true)
    })

    it('marks every tool that needs the server with its sign-in rule', () => {
        for (const tool of FALLBACK_TOOLS) {
            expect(tool.needsServer).toBe(tool.kind === 'server')
            if (tool.kind === 'server') expect(['optional', 'verified']).toContain(tool.auth)
            else expect(tool.auth).toBeUndefined()
            // Only tools that connect to a target need the acknowledgement
            expect(tool.requiresAcknowledgement).toBe(tool.auth === 'verified')
        }
    })

    it('points related reading only at cheatsheets that exist', () => {
        const sheets = readdirSync(join(process.cwd(), 'src', 'app', 'cheatsheets'))
        for (const tool of FALLBACK_TOOLS) {
            for (const slug of tool.related?.cheatsheets ?? []) expect(sheets).toContain(slug)
        }
    })

    it('does not keep the fake or removed tools', () => {
        const text = JSON.stringify(FALLBACK_TOOLS).toLowerCase()
        expect(text).not.toContain('coming soon')
        expect(FALLBACK_TOOLS.find((t) => t.slug === 'port-scanner')?.name).toMatch(/reference/i)
    })

    it('feeds the sitemap with one valid, existing page per tool', async () => {
        const urls = (await sitemap()).map((e) => e.url)
        for (const slug of folders) expect(urls).toContain(`https://thecyberhub.org/tools/${slug}`)
        expect(urls.filter((u) => u.includes('/tools/')).every((u) => folders.includes(u.split('/tools/')[1]))).toBe(true)
        expect(urls).not.toContain('https://thecyberhub.org/tools/ssl-scanner')
    })
})

describe('mergeRegistry', () => {
    it('returns the fallback list when there is no answer', () => {
        expect(mergeRegistry(undefined).live).toBe(false)
        expect(mergeRegistry(null).tools).toHaveLength(FALLBACK_TOOLS.length)
    })

    it('lays the API answer over the fallback, matched by slug', () => {
        const merged = mergeRegistry({
            categories: [{ id: 'recon', name: 'Recon' }, { id: 'web', name: 'Web' }],
            tools: [
                { slug: 'cve-search', id: 'cve', name: 'CVE lookup', description: 'New text', category: 'recon', popular: false, enabled: false, status: 'disabled' },
                { slug: 'dns-lookup', enabled: true, popular: true },
                { slug: 'not-a-page', name: 'No page here', enabled: true },
            ],
        })
        expect(merged.live).toBe(true)
        const cve = merged.tools.find((t) => t.slug === 'cve-search')!
        expect(cve).toMatchObject({ name: 'CVE lookup', description: 'New text', category: 'recon', popular: false, enabled: false, status: 'disabled' })
        // Front-end details survive the merge
        expect(cve.icon).toBe('bug')
        expect(cve.keywords.length).toBeGreaterThan(0)
        // A tool the API does not mention stays as it was, and one with no page is ignored
        expect(merged.tools.find((t) => t.slug === 'jwt-analyzer')?.enabled).toBe(true)
        expect(merged.tools.some((t) => t.slug === 'not-a-page')).toBe(false)
        expect(merged.tools).toHaveLength(FALLBACK_TOOLS.length)
        expect(merged.categories.map((c) => c.id)).toEqual(['recon', 'web'])
    })

    it('ignores an unknown category from the API', () => {
        const merged = mergeRegistry({ tools: [{ slug: 'whois-lookup', category: 'made-up' }] })
        expect(merged.tools.find((t) => t.slug === 'whois-lookup')?.category).toBe('recon')
    })

    it('takes the sign-in rule from the API', () => {
        const merged = mergeRegistry({ tools: [{ slug: 'ssl-checker', kind: 'server', auth: 'optional', requiresAcknowledgement: false }] })
        const ssl = merged.tools.find((t) => t.slug === 'ssl-checker')!
        expect(ssl.auth).toBe('optional')
        expect(ssl.requiresAcknowledgement).toBe(false)
    })
})

describe('filters', () => {
    const tools = FALLBACK_REGISTRY.tools

    it('finds a tool by name, keyword or category and needs every word', () => {
        expect(filterTools(tools, { q: 'jwt', cat: 'all' }).map((t) => t.slug)).toContain('jwt-analyzer')
        expect(filterTools(tools, { q: 'certificate', cat: 'all' }).map((t) => t.slug)).toContain('ssl-checker')
        expect(filterTools(tools, { q: 'recon', cat: 'all' }).length).toBeGreaterThan(2)
        expect(filterTools(tools, { q: 'dns cve', cat: 'all' })).toHaveLength(0)
        expect(filterTools(tools, { q: 'zzzz-nothing', cat: 'all' })).toHaveLength(0)
    })

    it('narrows by category and by popular', () => {
        const payloads = filterTools(tools, { q: '', cat: 'payloads' })
        expect(payloads.length).toBeGreaterThan(0)
        expect(payloads.every((t) => t.category === 'payloads')).toBe(true)
        const popular = filterTools(tools, { q: '', cat: 'popular' })
        expect(popular.length).toBeGreaterThan(0)
        expect(popular.every((t) => t.popular)).toBe(true)
    })

    it('counts per chip and the counts add up', () => {
        const counts = countByFilter(tools)
        expect(counts.all).toBe(tools.length)
        expect(CATEGORIES.reduce((n, c) => n + (counts[c.id] ?? 0), 0)).toBe(tools.length)
    })

    it('reads and writes the address, leaving out defaults', () => {
        expect(parseToolFilters(new URLSearchParams('q=jwt&cat=crypto'))).toEqual({ q: 'jwt', cat: 'crypto' })
        expect(parseToolFilters(new URLSearchParams('cat=nonsense'))).toEqual({ q: '', cat: 'all' })
        expect(toolFilterQuery({ q: '', cat: 'all' })).toBe('')
        expect(toolFilterQuery({ q: ' jwt ', cat: 'popular' })).toBe('?q=jwt&cat=popular')
        expect(parseToolFilters(new URLSearchParams(toolFilterQuery({ q: 'a b', cat: 'web' })))).toEqual({ q: 'a b', cat: 'web' })
    })

    it('matches a single tool', () => {
        const dns = tools.find((t) => t.slug === 'dns-lookup')!
        expect(matchesQuery(dns, 'spf')).toBe(true)
        expect(matchesQuery(dns, '')).toBe(true)
    })
})

describe('badges, popular and related links', () => {
    it('tells where each kind of tool runs', () => {
        expect(trustKind({ kind: 'offline' })).toBe('browser')
        expect(trustKind({ kind: 'reference' })).toBe('reference')
        expect(trustKind({ kind: 'server', auth: 'optional' })).toBe('server')
        expect(trustKind({ kind: 'server', auth: 'verified' })).toBe('server-login')
    })

    it('puts popular tools first and respects the limit', () => {
        const list = popularTools(FALLBACK_TOOLS, 6)
        expect(list).toHaveLength(6)
        expect(list.slice(0, FALLBACK_TOOLS.filter((t) => t.popular).length).every((t) => t.popular)).toBe(true)
    })

    it('builds cheatsheet, challenge and learning path links', () => {
        const links = relatedLinks(FALLBACK_TOOLS.find((t) => t.slug === 'header-analyzer')!)
        expect(links.map((l) => l.href)).toEqual(['/cheatsheets/web-security', '/challenges?category=web', '/learning-paths'])
        expect(relatedLinks({ related: undefined })).toEqual([])
        expect(toolHref('x')).toBe('/tools/x')
    })
})
