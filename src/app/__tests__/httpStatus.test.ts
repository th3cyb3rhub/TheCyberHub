import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `notFound()` and `permanentRedirect()` only change the HTTP status while nothing has been sent yet.
 * A `loading.tsx` wraps its page (and every page below it) in a Suspense boundary, so the response
 * starts with the loading screen as HTTP 200 and the answer arrives as an in-stream marker. These
 * pages decide the status, so neither they nor any segment above them may have a `loading.tsx`.
 */
const APP = join(__dirname, '..')

/** Pages that answer with a real 404 (and 308 where they move) */
const STATUS_PAGES: { route: string; notFound: boolean; permanentRedirect?: boolean; recoversInBrowser: boolean }[] = [
    { route: 'jobs/[slug]', notFound: true, permanentRedirect: true, recoversInBrowser: true },
    { route: 'labs/[slug]', notFound: true, recoversInBrowser: true },
    { route: 'ctf/competitions/[slug]', notFound: true, recoversInBrowser: true },
    { route: 'ctf/competitions/[slug]/results', notFound: true, recoversInBrowser: true },
    { route: 'code-review/[ref]', notFound: true, recoversInBrowser: true },
    { route: 'internships/[id]', notFound: true, recoversInBrowser: true },
    { route: 'company/[slug]', notFound: true, recoversInBrowser: false },
    { route: 'events/series/[id]', notFound: true, recoversInBrowser: false },
    { route: 'certificates/[id]', notFound: true, recoversInBrowser: false },
    { route: 'roadmaps/[slug]', notFound: false, permanentRedirect: false, recoversInBrowser: false },
    { route: 'learning-paths/[slug]', notFound: false, permanentRedirect: false, recoversInBrowser: false },
]

/**
 * Pages whose content the server fetches. Under a `loading.tsx` the server HTML would hold the loading
 * screen and the content would arrive in a hidden element that only a script reveals: no content for a
 * crawler or a browser without JavaScript.
 */
const SERVER_DATA_PAGES = ['events/[slug]', 'resources/[slug]', 'mentorship/mentor/[id]', 'internships/[id]', 'jobs', 'labs', 'code-review', 'ctf/competitions']

const ancestors = (route: string): string[] => {
    const parts = route.split('/')
    return ['', ...parts.map((_, i) => parts.slice(0, i + 1).join('/'))]
}

describe('pages that decide the HTTP status', () => {
    for (const { route, notFound, recoversInBrowser } of STATUS_PAGES) {
        describe(route, () => {
            it('has no loading.tsx at its segment or above (not even the app wide one)', () => {
                const found = ancestors(route).filter((dir) => existsSync(join(APP, dir, 'loading.tsx')))
                expect(found).toEqual([])
            })

            if (notFound) {
                it('calls notFound() in the page', () => {
                    expect(readFileSync(join(APP, route, 'page.tsx'), 'utf8')).toMatch(/notFound\(\)/)
                })
            }
            if (recoversInBrowser) {
                it('has a not-found.tsx that asks again in the browser, for a poster, reviewer or staff viewer', () => {
                    const file = join(APP, route, 'not-found.tsx')
                    expect(existsSync(file)).toBe(true)
                    // Either a client component itself, or one that hands the address to a client view
                    const source = readFileSync(file, 'utf8')
                    expect(source).toMatch(/^'use client'|useAuth|View|NotFound/)
                })
            }
        })
    }

    for (const route of SERVER_DATA_PAGES) {
        it(`${route} has no loading.tsx at its segment or above, so its content is in the server HTML`, () => {
            expect(ancestors(route).filter((dir) => existsSync(join(APP, dir, 'loading.tsx')))).toEqual([])
        })
    }

    it('the job page redirects an old address with permanentRedirect (HTTP 308)', () => {
        expect(readFileSync(join(APP, 'jobs/[slug]/page.tsx'), 'utf8')).toMatch(/permanentRedirect\(`\/jobs\/\$\{canonical\}`\)/)
    })

    it('a page moved between roadmaps and learning paths is a permanent redirect', () => {
        const source = readFileSync(join(APP, '../components/learning/PathPage.tsx'), 'utf8')
        expect(source).toMatch(/permanentRedirect\(/)
        expect(source).not.toMatch(/\bredirect\(/)
    })

    it('no app wide loading.tsx wraps the whole tree', () => {
        expect(existsSync(join(APP, 'loading.tsx'))).toBe(false)
    })
})

describe('the root layout', () => {
    const layout = readFileSync(join(APP, 'layout.tsx'), 'utf8')

    it('themes <html> before paint with the shared script and only suppresses hydration warnings there', () => {
        expect(layout).toContain('themeInitScript')
        expect((layout.match(/suppressHydrationWarning/g) ?? []).length).toBe(1)
        expect(layout).toMatch(/<html[^>]*className="dark"[^>]*suppressHydrationWarning/)
    })

    it('renders the default (dark) theme on the server', () => {
        expect(layout).toMatch(/<html lang="en" className="dark"/)
    })
})
