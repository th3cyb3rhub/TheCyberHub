import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The address cannot be read yet: the boundary shows its fallback, like the server render of the page
vi.mock('next/navigation', () => ({
    useSearchParams: () => { throw new Promise(() => {}) },
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
    usePathname: () => '/ctf',
}))
vi.mock('@/components/Footer', () => ({ default: () => <footer>site footer</footer> }))

import CTFPage from '../page'

describe('/ctf before the address is read', () => {
    it('has its hero and footer in the HTML, outside the boundary that waits for the address', () => {
        const html = renderToString(<CTFPage />)
        expect(html).toMatch(/<h1[^>]*>Capture The/)
        expect(html).toContain('href="/ctf/leaderboard"')
        expect(html).toContain('href="/ctf/competitions"')
        expect(html).toContain('site footer')
        // the list and its search belong to the part that waits
        expect(html).toContain('aria-label="Loading"')
        expect(html).not.toContain('Search challenges')
    })
})
