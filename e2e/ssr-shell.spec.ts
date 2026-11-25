import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mockEmptyApi, signInAs, testUser } from './helpers';
import { EVENT_SLUG, OLD_JOB_SLUG } from './support/mock-api-server';

/**
 * The server rendered shell: the HTML of a page is complete before any script runs, the theme is on
 * <html> before the first paint, and missing pages answer with a real HTTP status.
 *
 * Most checks need nothing but the app. The ones marked "(server data)" read what the app's server
 * fetched while rendering, which a browser route cannot intercept: they run against a stand-in API.
 * Start it with `E2E_MOCK_API_PORT=5891 npx playwright test e2e/ssr-shell.spec.ts` (the config starts
 * it), after building and starting the app with `NEXT_PUBLIC_API_URL=http://localhost:5891`.
 * Without that variable those checks are skipped.
 */
const SERVER_DATA = !!process.env.E2E_MOCK_API_PORT;
const needsServerData = () => test.skip(!SERVER_DATA, 'needs the stand-in API: set E2E_MOCK_API_PORT and start the app with NEXT_PUBLIC_API_URL pointing at it');

const JOB = 'senior-pentester-aaaaaa';
const LAB = 'sql-injection-basics';
const EXERCISE = 'sql-injection-login';
const COMPETITION = 'frozen-cup';

const get = (request: APIRequestContext, path: string) => request.get(path, { maxRedirects: 0 });

test.describe('first paint without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('home: heading, navigation and footer are in the server HTML', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
        await expect(page.locator('footer')).toBeVisible();
        // The default theme is on the element the server sends
        await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    });

    test('jobs list: heading is in the server HTML', async ({ page }) => {
        await page.goto('/jobs');
        await expect(page.getByRole('heading', { level: 1, name: 'Find your next security role' })).toBeVisible();
    });

    test('jobs list: the jobs are links in the server HTML (server data)', async ({ page }) => {
        needsServerData();
        await page.goto('/jobs');
        await expect(page.getByRole('link', { name: /Senior Pentester/ }).first()).toBeVisible();
    });

    test('job detail: heading, description and JobPosting data are in the server HTML (server data)', async ({ page, request }) => {
        needsServerData();
        await page.goto(`/jobs/${JOB}`);
        await expect(page.getByRole('heading', { level: 1, name: 'Senior Pentester' })).toBeVisible();
        await expect(page.getByText('break things for a living').first()).toBeVisible();

        const html = await (await get(request, `/jobs/${JOB}`)).text();
        const scripts = Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g));
        expect(scripts).toHaveLength(1);
        const data = JSON.parse(scripts[0][1].replace(/\\u003c/g, '<'));
        expect(data['@type']).toBe('JobPosting');
        expect(data.title).toBe('Senior Pentester');
    });

    test('lab detail: heading and instructions are in the server HTML (server data)', async ({ page }) => {
        needsServerData();
        await page.goto(`/labs/${LAB}`);
        await expect(page.getByRole('heading', { level: 1, name: 'SQL Injection Basics' })).toBeVisible();
        await expect(page.getByText('Find the flag.').first()).toBeVisible();
    });

    test('labs list: heading is in the server HTML', async ({ page }) => {
        await page.goto('/labs');
        await expect(page.getByRole('heading', { level: 1, name: 'Security Labs' })).toBeVisible();
    });

    test('code review list: heading and exercises are in the server HTML (server data)', async ({ page }) => {
        needsServerData();
        await page.goto('/code-review');
        await expect(page.getByRole('heading', { level: 1, name: 'Code Review' })).toBeVisible();
        await expect(page.getByText('Login check').first()).toBeVisible();
    });

    test('code review exercise: heading and code are in the server HTML (server data)', async ({ page }) => {
        needsServerData();
        await page.goto(`/code-review/${EXERCISE}`);
        await expect(page.getByRole('heading', { level: 1, name: 'Login check' })).toBeVisible();
        await expect(page.getByText('def login(username, password):').first()).toBeVisible();
    });

    test('competition: heading is in the server HTML (server data)', async ({ page }) => {
        needsServerData();
        await page.goto(`/ctf/competitions/${COMPETITION}`);
        await expect(page.getByRole('heading', { level: 1 }).first()).toContainText('Frozen Cup');
    });

    test('event: heading is in the server HTML (server data)', async ({ page }) => {
        needsServerData();
        await page.goto(`/events/${EVENT_SLUG}`);
        await expect(page.getByRole('heading', { level: 1, name: 'Winter CTF Night' })).toBeVisible();
    });
});

test.describe('real HTTP statuses', () => {
    test('an address that cannot be a job, lab, exercise, competition, program or company is a 404 without asking the API', async ({ request }) => {
        for (const path of [
            '/jobs/not%20a%20job', '/labs/BAD_slug', '/labs/progress', '/code-review/BAD_slug', '/code-review/manage',
            '/ctf/competitions/BAD_slug', '/ctf/competitions/BAD_slug/results', '/internships/not-an-id', '/company/BAD_slug',
        ]) {
            const res = await get(request, path);
            expect(res.status(), path).toBe(404);
        }
    });

    test('a 404 tells search engines not to index it, and the browser still shows the page for it', async ({ page, request }) => {
        const html = await (await get(request, '/labs/BAD_slug')).text();
        expect(html).toMatch(/<meta name="robots" content="noindex/);
        // The 404 view itself is drawn by the browser (the server sends the status and the data for it)
        const response = await page.goto('/labs/BAD_slug');
        expect(response?.status()).toBe(404);
        await expect(page.getByRole('heading', { level: 1, name: 'This lab is not available' })).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    });

    test('missing pages are HTTP 404 (server data)', async ({ request }) => {
        needsServerData();
        for (const path of [
            '/jobs/no-such-job-zzzzzz', '/labs/no-such-lab', '/code-review/no-such-exercise', '/ctf/competitions/no-such-cup', '/ctf/competitions/no-such-cup/results',
            '/company/no-such-company', `/internships/${'9'.repeat(24)}`, '/events/series/no-such-series',
        ]) {
            const res = await get(request, path);
            expect(res.status(), path).toBe(404);
        }
    });

    test('an old job address is HTTP 308 to the canonical one (server data)', async ({ request }) => {
        needsServerData();
        const res = await get(request, `/jobs/${OLD_JOB_SLUG}`);
        expect(res.status()).toBe(308);
        expect(new URL(res.headers()['location'], 'http://x').pathname).toBe(`/jobs/${JOB}`);
    });

    test('existing pages are HTTP 200 (server data)', async ({ request }) => {
        needsServerData();
        for (const path of [`/jobs/${JOB}`, `/labs/${LAB}`, `/code-review/${EXERCISE}`, `/ctf/competitions/${COMPETITION}`, '/company/acme-security', `/events/${EVENT_SLUG}`]) {
            const res = await get(request, path);
            expect(res.status(), path).toBe(200);
        }
    });

    test('a missing job can still be opened by its poster: the 404 page asks again with their token (server data)', async ({ page }) => {
        needsServerData();
        // The poster's own request finds the job (here: the browser's answer for the viewer), so the page replaces the 404 view
        await page.addInitScript(() => window.localStorage.setItem('token', 'e2e-token'));
        await mockEmptyApi(page);
        await page.route('**/api/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ success: true, data: { ...testUser, id: 'emp-1', role: 'employer' } }) }));
        await page.route('**/api/jobs/draft-role-zzzzzz', (route) => route.fulfill({
            status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ success: true, data: { _id: 'c'.repeat(24), slug: 'draft-role-zzzzzz', title: 'Draft Role Of Mine', status: 'draft', category: 'pentesting', company: 'Acme Security', companyLogo: null, employmentType: 'full-time', experienceLevel: 'senior', locationType: 'remote', location: null, salary: null, skills: [], isFeatured: false, applicationDeadline: null, expiresAt: new Date(Date.now() + 864e5).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), viewCount: 0, isActive: false, description: 'A draft that only its poster can read.', requirements: [], responsibilities: [], benefits: [], applyUrl: 'https://example.org/apply', applyEmail: null, viewer: { saved: false, isOwner: true } }, meta: {} }),
        }));
        const response = await page.goto('/jobs/draft-role-zzzzzz');
        expect(response?.status()).toBe(404);
        await expect(page.getByRole('heading', { level: 1, name: 'Draft Role Of Mine' })).toBeVisible();
    });
});

/** The class and attribute `applyTheme` sets, read from <html> */
const themeOf = (page: Page) => page.evaluate(() => ({
    dark: document.documentElement.classList.contains('dark'),
    light: document.documentElement.classList.contains('light'),
    attr: document.documentElement.getAttribute('data-theme'),
}));
const DARK = { dark: true, light: false, attr: null };
const LIGHT = { dark: false, light: true, attr: 'light' };

test.describe('theme', () => {
    test('no stored choice and a dark system: dark, no data-theme', async ({ browser }) => {
        const context = await browser.newContext({ colorScheme: 'dark' });
        const page = await context.newPage();
        await page.goto('/');
        expect(await themeOf(page)).toEqual(DARK);
        await context.close();
    });

    test('no stored choice and a light system: light before any script of the app runs', async ({ browser }) => {
        const context = await browser.newContext({ colorScheme: 'light' });
        const page = await context.newPage();
        // Nothing of the app's bundle loads, so only the inline script in <head> can have set the theme
        await page.route('**/_next/static/chunks/**', (route) => route.abort());
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        expect(await themeOf(page)).toEqual(LIGHT);
        await context.close();
    });

    test('a stored choice beats the system, before any script of the app runs', async ({ browser }) => {
        const context = await browser.newContext({ colorScheme: 'dark' });
        await context.addInitScript(() => window.localStorage.setItem('tch-theme', 'light'));
        const page = await context.newPage();
        await page.route('**/_next/static/chunks/**', (route) => route.abort());
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        expect(await themeOf(page)).toEqual(LIGHT);
        await context.close();
    });

    test('an invalid stored value is ignored', async ({ browser }) => {
        const context = await browser.newContext({ colorScheme: 'light' });
        await context.addInitScript(() => window.localStorage.setItem('tch-theme', 'purple'));
        const page = await context.newPage();
        await page.goto('/');
        expect(await themeOf(page)).toEqual(LIGHT);
        expect(await page.evaluate(() => document.documentElement.classList.contains('purple'))).toBe(false);
        await context.close();
    });

    test('the toggle switches, stores the choice, and the choice survives a reload without a flash', async ({ browser }) => {
        const context = await browser.newContext({ colorScheme: 'dark' });
        const page = await context.newPage();
        await page.goto('/');
        await page.getByRole('button', { name: 'Toggle theme' }).click();
        await expect.poll(() => themeOf(page)).toEqual(LIGHT);
        expect(await page.evaluate(() => window.localStorage.getItem('tch-theme'))).toBe('light');

        await page.route('**/_next/static/chunks/**', (route) => route.abort());
        await page.reload({ waitUntil: 'domcontentloaded' });
        expect(await themeOf(page)).toEqual(LIGHT);
        await page.unroute('**/_next/static/chunks/**');
        await page.reload();
        await page.getByRole('button', { name: 'Toggle theme' }).click();
        await expect.poll(() => themeOf(page)).toEqual(DARK);
        expect(await page.evaluate(() => window.localStorage.getItem('tch-theme'))).toBe('dark');
        await context.close();
    });

    test('the toggle works with a stored choice too', async ({ browser }) => {
        const context = await browser.newContext({ colorScheme: 'dark' });
        await context.addInitScript(() => { if (!window.localStorage.getItem('tch-theme')) window.localStorage.setItem('tch-theme', 'light'); });
        const page = await context.newPage();
        await page.goto('/');
        await expect.poll(() => themeOf(page)).toEqual(LIGHT);
        await page.getByRole('button', { name: 'Toggle theme' }).click();
        await expect.poll(() => themeOf(page)).toEqual(DARK);
        await context.close();
    });

    test('blocked storage still renders the page and the toggle still switches for this visit', async ({ browser }) => {
        const context = await browser.newContext({ colorScheme: 'dark' });
        await context.addInitScript(() => {
            const deny = () => { throw new DOMException('blocked', 'SecurityError'); };
            Storage.prototype.getItem = deny;
            Storage.prototype.setItem = deny;
        });
        const page = await context.newPage();
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await themeOf(page)).toEqual(DARK);
        await page.getByRole('button', { name: 'Toggle theme' }).click();
        await expect.poll(() => themeOf(page)).toEqual(LIGHT);
        await context.close();
    });

    test('a change made in another tab arrives here', async ({ browser }) => {
        const context = await browser.newContext({ colorScheme: 'dark' });
        const first = await context.newPage();
        const second = await context.newPage();
        await first.goto('/');
        await second.goto('/');
        await first.getByRole('button', { name: 'Toggle theme' }).click();
        await expect.poll(() => themeOf(second)).toEqual(LIGHT);
        await context.close();
    });
});

/** What React says when the markup the browser built differs from the server's (production and development wording) */
const HYDRATION = /hydrat|did not match|didn't match|Minified React error #(418|419|422|423|425)\b|Text content does not match/i;

async function collectHydrationProblems(page: Page, path: string): Promise<string[]> {
    const problems: string[] = [];
    page.on('console', (msg) => { if ((msg.type() === 'error' || msg.type() === 'warning') && HYDRATION.test(msg.text())) problems.push(msg.text().slice(0, 300)); });
    page.on('pageerror', (error) => { if (HYDRATION.test(error.message)) problems.push(error.message.slice(0, 300)); });
    await page.goto(path);
    await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();
    // Hydration finishes a moment after the load event; a page that talks to third parties never goes network idle
    await page.waitForTimeout(1000);
    return problems;
}

const PUBLIC_PAGES = ['/', '/jobs', '/labs', '/code-review', '/ctf/competitions', '/blog', '/forums', '/tools', '/events', '/challenges', '/roadmaps', '/learning-paths', '/internships', '/auth'];
const MEMBER_PAGES = ['/', '/jobs', '/labs', '/code-review', '/ctf/competitions', '/blog', '/forums', '/profile', '/dashboard'];
const ADMIN_PAGES = ['/admin', '/admin/users', '/admin/jobs'];

test.describe('hydration', () => {
    for (const scheme of ['dark', 'light'] as const) {
        test.describe(`signed out, ${scheme} system`, () => {
            test.use({ colorScheme: scheme });
            for (const path of PUBLIC_PAGES) {
                test(`${path} hydrates without a mismatch`, async ({ page }) => {
                    await mockEmptyApi(page);
                    expect(await collectHydrationProblems(page, path)).toEqual([]);
                });
            }
        });
    }

    test.describe('signed in', () => {
        test.use({ colorScheme: 'light' });
        for (const path of MEMBER_PAGES) {
            test(`${path} hydrates without a mismatch (member)`, async ({ page }) => {
                await signInAs(page, { ...testUser, id: testUser._id, role: 'user' });
                expect(await collectHydrationProblems(page, path)).toEqual([]);
            });
        }
        for (const path of ADMIN_PAGES) {
            test(`${path} hydrates without a mismatch (admin)`, async ({ page }) => {
                await signInAs(page, { ...testUser, id: testUser._id, role: 'admin' });
                expect(await collectHydrationProblems(page, path)).toEqual([]);
            });
        }
    });

    test('a stored light theme on a server rendered page hydrates without a mismatch (server data)', async ({ page, context }) => {
        needsServerData();
        await context.addInitScript(() => window.localStorage.setItem('tch-theme', 'light'));
        for (const path of [`/jobs/${JOB}`, `/labs/${LAB}`, `/code-review/${EXERCISE}`, `/ctf/competitions/${COMPETITION}`, `/events/${EVENT_SLUG}`]) {
            expect(await collectHydrationProblems(page, path), path).toEqual([]);
        }
    });
});
