import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/code-review/CrHero', () => ({ CrHero: () => null }))
vi.mock('@/components/code-review/ServerSnippetList', () => ({ ServerSnippetList: () => null }))
vi.mock('@/components/code-review/SnippetsExplorer', () => ({ SnippetsExplorer: () => null }))
vi.mock('@/lib/codeReview/server', () => ({ fetchSnippetsPage: vi.fn(), fetchSnippetStats: vi.fn() }))

import { metadata } from '../page'

describe('the list page address', () => {
    it('names the plain list as the canonical address, so a filtered address is not a page of its own', () => {
        expect(metadata.alternates?.canonical).toBe('/code-review')
    })
})
