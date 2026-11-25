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
 * Pages whose data the server fetches. Under a `loading.tsx` the server HTML would hold the loading
 * screen and the content would arrive in a hidden element that only a script reveals. This only keeps the
 * boundary away; that the content really is in the HTML is proven by a test per page (see CONTENT_PROOFS).
 */
const SERVER_DATA_PAGES = ['events/[slug]', 'resources/[slug]', 'mentorship/mentor/[id]', 'internships/[id]', 'jobs', 'labs', 'code-review', 'ctf/competitions']

/** A page counts as "content in the server HTML" only when a test renders it on the server and reads the text */
const CONTENT_PROOFS: { route: string; test: string; mentions: RegExp }[] = [
    { route: 'events/[slug]', test: 'components/events/__tests__/EventDetailServer.test.tsx', mentions: /description/i },
]

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
                it('has a not-found.tsx that is a server component with the notice, and an island that asks again for a viewer with a token', () => {
                    const file = join(APP, route, 'not-found.tsx')
                    expect(existsSync(file)).toBe(true)
                    const source = readFileSync(file, 'utf8')
                    // Server component: the notice is part of what the server sends
                    expect(source).not.toMatch(/^['"]use client['"]/)
                    expect(source).toMatch(/<MissingPage kind="\w+" \/>/)
                    // The island that may ask the API again; it is a client file that checks the stored token
                    const island = source.match(/import \{ (\w+) \} from '(@\/components\/[^']*(?:Recovery|JobNotFound))'/)
                    expect(island).not.toBeNull()
                    const islandSource = readFileSync(join(APP, '..', island![2].replace('@/', ''), '').replace(/\/$/, '') + '.tsx', 'utf8')
                    expect(islandSource).toMatch(/^'use client'/)
                    expect(islandSource).toMatch(/useHasStoredToken\(\)/)
                })
            }
        })
    }

    for (const route of SERVER_DATA_PAGES) {
        it(`${route} has no loading.tsx at its segment or above, so its content is in the server HTML`, () => {
            expect(ancestors(route).filter((dir) => existsSync(join(APP, dir, 'loading.tsx')))).toEqual([])
        })
    }

    for (const { route, test, mentions } of CONTENT_PROOFS) {
        it(`${route} has a server render test that reads its text`, () => {
            const file = join(APP, '..', test)
            expect(existsSync(file)).toBe(true)
            const source = readFileSync(file, 'utf8')
            expect(source).toMatch(/renderToString/)
            expect(source).toMatch(mentions)
        })
    }

    it('the job page moves an old address with permanentRedirect (HTTP 308), through the validating helper', () => {
        const source = readFileSync(join(APP, 'jobs/[slug]/page.tsx'), 'utf8')
        expect(source).toMatch(/permanentRedirect\(moved\)/)
        expect(source).toMatch(/jobMoveTarget\(/)
        expect(source).not.toMatch(/permanentRedirect\(`/)
    })

    it('a page moved between roadmaps and learning paths is a permanent redirect', () => {
        const source = readFileSync(join(APP, '../components/learning/PathPage.tsx'), 'utf8')
        expect(source).toMatch(/permanentRedirect\(moved\)/)
        expect(source).toMatch(/pathMoveTarget\(/)
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
