import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ServerLabList } from '@/components/labs/ServerLabList'
import { ServerSnippetList } from '@/components/code-review/ServerSnippetList'
import type { LabCard } from '@/types/lab'
import type { CrCard, CrStats } from '@/types/codeReview'

// What the server sends while the interactive lists load: the plain cards under a toolbar of the same
// height, so nothing jumps when the real toolbar arrives
describe('server lists', () => {
    const lab = { _id: 'l1', slug: 'sqli', title: 'SQL Injection Basics', description: 'd', category: 'web', difficulty: 'easy', tags: [], points: 50 } as unknown as LabCard
    const snippet = { _id: 's1', ref: 'r1', title: 'Login check', description: 'd', category: 'injection', language: 'python', difficulty: 'easy', tags: [] } as unknown as CrCard

    it('lab list keeps a toolbar placeholder, hidden from assistive technology, above the cards', () => {
        const html = renderToString(<ServerLabList labs={[lab]} />)
        expect(html).toContain('data-testid="list-toolbar-skeleton"')
        expect(html).toMatch(/aria-hidden="true"[^>]*data-testid="list-toolbar-skeleton"/)
        expect(html).toContain('SQL Injection Basics')
        expect(html.indexOf('list-toolbar-skeleton')).toBeLessThan(html.indexOf('lab-grid'))
        expect(html).not.toContain('role="search"')
    })

    it('draws the difficulty chips with the counts the server already has', () => {
        const facets = { total: 3, categories: [], difficulties: [{ difficulty: 'easy', count: 2 }, { difficulty: 'hard', count: 1 }] }
        const html = renderToString(<ServerLabList labs={[lab]} facets={facets as never} />)
        expect(html).toContain('Easy (2)')
        expect(html).toContain('Hard (1)')
        expect(html).toContain('>Medium<')
    })

    it('snippet list does the same with the totals', () => {
        const stats = { total: 1, facets: { categories: [], languages: [], difficulties: [{ difficulty: 'easy', count: 1 }] } } as unknown as CrStats
        const html = renderToString(<ServerSnippetList snippets={[snippet]} stats={stats} />)
        expect(html).toContain('Easy (1)')
        expect(html).toContain('Login check')
        expect(html).toContain('1 exercise')
    })

    it('shows the skeleton cards under the toolbar when the API did not answer', () => {
        expect(renderToString(<ServerLabList labs={null} />)).toContain('Loading labs')
        expect(renderToString(<ServerSnippetList snippets={null} />)).toContain('list-toolbar-skeleton')
    })
})
