import { test, expect, type Page } from '@playwright/test';
import { json, preflight, signInAs, testUser } from './helpers';

/**
 * The security tools, against canned API answers. Nothing here depends on a live backend: every
 * /api/tools call is answered by a route, so each state (result, limit, paused, blocked) is exact.
 */

type Handler = (url: URL, method: string) => { status?: number; body: unknown };

/** Answers one API path, preflights included. Registered after signInAs so it wins over the empty default. */
async function mockApi(page: Page, glob: string, handler: Handler) {
    await page.route(glob, (route) => {
        const request = route.request();
        if (request.method() === 'OPTIONS') return preflight(route);
        const { status = 200, body } = handler(new URL(request.url()), request.method());
        return json(route, body, status);
    });
}

const ok = (data: unknown, meta: Record<string, unknown> = {}) => ({ status: 200, body: { success: true, data, meta: { cached: false, ...meta } } });
const fail = (status: number, code: string, message: string, meta: Record<string, unknown> = {}) => ({ status, body: { success: false, error: { code, message, meta } } });

/** The live registry and capabilities; pass overrides to switch a tool off */
async function mockRegistry(page: Page, { tools = [], capabilities = {} }: { tools?: Record<string, unknown>[]; capabilities?: Record<string, unknown> } = {}) {
    await mockApi(page, '**/api/tools', () => ok({ tools }));
    await mockApi(page, '**/api/tools/capabilities', () => ok({ tools: capabilities }));
}

test.describe('Tools index', () => {
    test.beforeEach(async ({ page }) => {
        await mockRegistry(page);
    });

    test('lists every tool with a category chip each', async ({ page }) => {
        await page.goto('/tools');
        await expect(page.getByRole('heading', { level: 1, name: 'Security tools' })).toBeVisible();
        await expect(page.getByTestId('tool-card').first()).toBeVisible();
        expect(await page.getByTestId('tool-card').count()).toBeGreaterThanOrEqual(20);
        await expect(page.getByTestId('chip-all')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('chip-recon')).toBeVisible();
    });

    test('narrows by category and keeps it in the address', async ({ page }) => {
        await page.goto('/tools');
        await page.getByTestId('chip-recon').click();
        await expect(page.getByTestId('chip-recon')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('[data-testid="tool-card"][data-slug="dns-lookup"]')).toBeVisible();
        await expect(page.locator('[data-testid="tool-card"][data-slug="ssl-checker"]')).toHaveCount(0);
        await expect(page).toHaveURL(/cat=recon/);
    });

    test('searches, shares the search in the address, and clears it', async ({ page }) => {
        await page.goto('/tools?q=whois');
        await expect(page.getByRole('searchbox', { name: 'Search tools' })).toHaveValue('whois');
        await expect(page.locator('[data-testid="tool-card"][data-slug="whois-lookup"]')).toBeVisible();
        await expect(page.locator('[data-testid="tool-card"][data-slug="dns-lookup"]')).toHaveCount(0);
        await page.getByRole('button', { name: 'Clear search' }).click();
        await expect(page.getByTestId('tool-card').nth(5)).toBeVisible();
        await expect(page).not.toHaveURL(/q=/);
    });

    test('shows an empty state that clears the filters', async ({ page }) => {
        await page.goto('/tools');
        await page.getByRole('searchbox', { name: 'Search tools' }).fill('zzzznonexistenttool');
        await expect(page.getByTestId('tools-empty')).toBeVisible();
        await page.getByRole('button', { name: 'Clear filters' }).click();
        await expect(page.getByTestId('tools-empty')).toHaveCount(0);
        await expect(page.getByTestId('tool-card').first()).toBeVisible();
    });

    test('the slash key focuses the search box', async ({ page }) => {
        await page.goto('/tools');
        await expect(page.getByTestId('tool-card').first()).toBeVisible();
        await page.keyboard.press('/');
        await expect(page.getByRole('searchbox', { name: 'Search tools' })).toBeFocused();
    });

    test('a tool the API reports as paused is marked paused', async ({ page }) => {
        await mockRegistry(page, { tools: [{ slug: 'ssl-checker', enabled: false, status: 'disabled' }] });
        await page.goto('/tools');
        await expect(page.locator('[data-testid="tool-card"][data-slug="ssl-checker"]').getByText('Paused')).toBeVisible();
    });

    test('still lists the tools when the registry call fails', async ({ page }) => {
        await mockApi(page, '**/api/tools', () => fail(500, 'INTERNAL', 'down'));
        await page.goto('/tools');
        await expect(page.getByTestId('tool-card').first()).toBeVisible();
        await expect(page.getByTestId('registry-fallback')).toBeVisible();
    });
});

test.describe('Tools that run in the browser', () => {
    test('the JWT analyzer decodes its sample token', async ({ page }) => {
        await mockRegistry(page);
        await page.goto('/tools/jwt-analyzer');
        await expect(page.locator('textarea').first()).toHaveValue(/^eyJ/);
    });

    test('the hash analyzer loads', async ({ page }) => {
        await mockRegistry(page);
        await page.goto('/tools/hash-analyzer');
        await expect(page.getByRole('heading', { level: 1 })).toContainText(/hash/i);
    });
});

test.describe('WHOIS lookup (public lookup, no account)', () => {
    const whois = { domain: 'example.com', registrar: 'Example Registrar', status: ['client transfer prohibited'], created: '1995-08-14T00:00:00Z', expires: '2099-08-13T00:00:00Z', updated: null, nameservers: ['a.iana-servers.net'], dnssec: true, source: 'rdap' };

    test.beforeEach(async ({ page }) => {
        await mockRegistry(page);
    });

    test('shows the registration, and says when it came from the cache', async ({ page }) => {
        await mockApi(page, '**/api/tools/whois*', (url) => {
            expect(url.searchParams.get('domain')).toBe('example.com');
            return ok(whois, { cached: true, tookMs: 4 });
        });
        await page.goto('/tools/whois-lookup');
        await page.getByLabel('Domain name').fill('https://Example.com/some/path');
        await page.getByRole('button', { name: 'Look up' }).click();
        await expect(page.getByText('Example Registrar')).toBeVisible();
        await expect(page.getByTestId('result-meta').getByText('Cached')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Copy summary' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Download JSON' })).toBeVisible();
    });

    test('says a domain has no registration instead of failing', async ({ page }) => {
        await mockApi(page, '**/api/tools/whois*', () => fail(404, 'TOOL_NOT_FOUND', 'No registration found for this domain'));
        await page.goto('/tools/whois-lookup');
        await page.getByLabel('Domain name').fill('nothing-here.example');
        await page.getByRole('button', { name: 'Look up' }).click();
        const error = page.getByTestId('tool-error');
        await expect(error).toHaveAttribute('data-kind', 'not_found');
        await expect(error).toContainText('No registration found for this domain');
        await expect(error.getByRole('button')).toHaveCount(0);
    });

    test('counts down a rate limit and holds the retry button until it is over', async ({ page }) => {
        await mockApi(page, '**/api/tools/whois*', () => fail(429, 'TOOL_RATE_LIMITED', 'Too many requests', { scope: 'minute', retryAfter: 90 }));
        await page.goto('/tools/whois-lookup');
        await page.getByLabel('Domain name').fill('example.com');
        await page.getByRole('button', { name: 'Look up' }).click();
        const error = page.getByTestId('tool-error');
        await expect(error).toHaveAttribute('data-kind', 'rate_limited');
        await expect(error).toContainText('too many times in the last minute');
        await expect(error.getByRole('button', { name: /try again in/i })).toBeDisabled();
        await expect(error.getByText(/try again in/i)).toHaveCount(1);
    });

    test('rejects something that is not a domain without calling the API', async ({ page }) => {
        let calls = 0;
        await mockApi(page, '**/api/tools/whois*', () => { calls += 1; return ok(whois); });
        await page.goto('/tools/whois-lookup');
        await page.getByLabel('Domain name').fill('not a domain');
        await page.getByRole('button', { name: 'Look up' }).click();
        await expect(page.locator('#whois-domain-error')).toContainText('Enter a domain name');
        expect(calls).toBe(0);
    });

    test('shows the paused notice and disables the form when the tool is switched off', async ({ page }) => {
        await mockRegistry(page, { capabilities: { whois: { enabled: false, reason: 'admin_off' } } });
        await page.goto('/tools/whois-lookup');
        await expect(page.getByTestId('paused-notice')).toContainText('An administrator has paused this tool');
        await expect(page.getByLabel('Domain name')).toBeDisabled();
    });
});

test.describe('DNS lookup', () => {
    test('reports a failed record type as a failure, not as empty', async ({ page }) => {
        await mockRegistry(page);
        await mockApi(page, '**/api/tools/dns*', () => ok({
            name: 'example.com', kind: 'domain', exists: null,
            results: { A: { status: 'ok', records: [{ value: '93.184.216.34', ttl: 300 }] }, MX: { status: 'error', records: [], error: 'timeout' } },
        }));
        await page.goto('/tools/dns-lookup');
        await page.getByLabel('Domain name or IP address').fill('example.com');
        await page.getByRole('button', { name: 'Look up' }).click();
        await expect(page.getByTestId('dns-A')).toHaveAttribute('data-status', 'ok');
        await expect(page.getByTestId('dns-MX')).toHaveAttribute('data-status', 'error');
        await expect(page.getByTestId('dns-MX')).toContainText('not the same as having no records');
    });
});

test.describe('HTTP header analyzer (needs a verified account and a confirmation)', () => {
    const result = {
        requestedUrl: 'https://example.com/', finalUrl: 'https://example.com/', status: 200, statusText: 'OK', redirects: [],
        headers: [{ name: 'server', value: 'nginx' }],
        checks: [
            { id: 'hsts', header: 'strict-transport-security', status: 'pass', message: 'HSTS is set.' },
            { id: 'csp', header: 'content-security-policy', status: 'fail', message: 'No Content-Security-Policy header.' },
        ],
        summary: { pass: 1, warn: 0, fail: 1, info: 0, na: 0 }, cookies: [], scannedAt: '2026-11-24T10:00:00.000Z',
    };

    test('asks a signed-out visitor to sign in', async ({ page }) => {
        await mockRegistry(page);
        await mockApi(page, '**/api/auth/me', () => fail(401, 'AUTH_TOKEN_INVALID', 'Unauthorized'));
        await page.goto('/tools/header-analyzer');
        await expect(page.getByTestId('login-gate')).toBeVisible();
        await expect(page.getByLabel('URL to check')).toBeDisabled();
    });

    test('asks an unverified account to verify first', async ({ page }) => {
        await signInAs(page, { ...testUser, isVerified: false });
        await mockRegistry(page);
        await page.goto('/tools/header-analyzer');
        await expect(page.getByTestId('verify-gate')).toBeVisible();
        await expect(page.getByLabel('URL to check')).toBeDisabled();
    });

    test('needs the confirmation, then sends it with the address and shows the findings', async ({ page }) => {
        await signInAs(page);
        await mockRegistry(page);
        let sent: Record<string, unknown> | null = null;
        await page.route('**/api/tools/headers', (route) => {
            const request = route.request();
            if (request.method() === 'OPTIONS') return preflight(route);
            sent = request.postDataJSON();
            return json(route, { success: true, data: result, meta: { cached: false, tookMs: 120, quota: { limit: 30, remaining: 29, resetSeconds: 3000 } } });
        });
        await page.goto('/tools/header-analyzer');
        await page.getByLabel('URL to check').fill('https://example.com');
        const run = page.getByRole('button', { name: 'Analyze headers' });
        await expect(run).toBeDisabled();
        await page.getByRole('checkbox', { name: /I own this target/ }).check();
        await expect(run).toBeEnabled();
        await run.click();

        const checks = page.getByTestId('header-check');
        await expect(checks).toHaveCount(2);
        await expect(checks.first()).toHaveAttribute('data-status', 'fail');
        await expect(page.getByTestId('quota')).toContainText('29 of 30 runs left');
        expect(sent).toEqual({ url: 'https://example.com', ack: true });
    });

    test('says why a private address is refused', async ({ page }) => {
        await signInAs(page);
        await mockRegistry(page);
        await mockApi(page, '**/api/tools/headers', () => fail(422, 'TOOL_TARGET_BLOCKED', 'Target not allowed', { reason: 'private' }));
        await page.goto('/tools/header-analyzer');
        await page.getByLabel('URL to check').fill('http://192.168.1.10');
        await page.getByRole('checkbox', { name: /I own this target/ }).check();
        await page.getByRole('button', { name: 'Analyze headers' }).click();
        const error = page.getByTestId('tool-error');
        await expect(error).toHaveAttribute('data-kind', 'blocked');
        await expect(error).toContainText('private network address');
    });

    test('shows that active tools are off in this environment', async ({ page }) => {
        await signInAs(page);
        await mockRegistry(page, { capabilities: { headers: { enabled: false, reason: 'active_off' } } });
        await page.goto('/tools/header-analyzer');
        await expect(page.getByTestId('paused-notice')).toContainText('not switched on in this environment');
        await expect(page.getByLabel('URL to check')).toBeDisabled();
    });
});

test.describe('Subdomain takeover check (slow run)', () => {
    test('shows a progress message while it runs and a timeout in words', async ({ page }) => {
        await signInAs(page);
        await mockRegistry(page);
        await page.route('**/api/tools/takeover', async (route) => {
            if (route.request().method() === 'OPTIONS') return preflight(route);
            await new Promise((resolve) => setTimeout(resolve, 600));
            return json(route, { success: false, error: { code: 'TOOL_UPSTREAM_TIMEOUT', message: 'Timed out', meta: {} } }, 504);
        });
        await page.goto('/tools/sub-takeover');
        await page.getByRole('textbox').first().fill('example.com');
        await page.getByRole('checkbox', { name: /I own this target/ }).check();
        await page.getByRole('button', { name: /^check/i }).click();
        await expect(page.getByText(/up to a minute/i)).toBeVisible();
        const error = page.getByTestId('tool-error');
        await expect(error).toHaveAttribute('data-kind', 'timeout');
        await expect(error.getByRole('button', { name: 'Try again' })).toBeEnabled();
    });
});

test.describe('Admin: security tools', () => {
    const settings: { masterEnabled: boolean; activeToolsAllowed: boolean; tools: { id: string; enabled: boolean; [key: string]: unknown }[]; blockedTargets: string[] } = {
        masterEnabled: true, activeToolsAllowed: true,
        tools: [
            { id: 'cve', mode: 'passive', enabled: true, reason: null, dailyCap: null, defaultDailyCap: 5000, usedToday: 12 },
            { id: 'ssl', mode: 'active', enabled: true, reason: null, dailyCap: 100, defaultDailyCap: 500, usedToday: 95 },
        ],
        blockedTargets: ['optout.example'],
    };
    const stats = { days: 7, since: '2026-11-17T00:00:00.000Z', tools: { cve: { ok: 10, blocked: 0, error: 1, limited: 2, cached: 5 } }, blockedReasons: { private: 3 } };

    test('does not show the controls to a regular member', async ({ page }) => {
        await signInAs(page);
        await mockRegistry(page);
        let calls = 0;
        await mockApi(page, '**/api/admin/tools/**', () => { calls += 1; return ok(settings); });
        await page.goto('/admin/tools');
        await expect(page.getByText('Only administrators can change the security tools settings.')).toBeVisible();
        expect(calls).toBe(0);
    });

    test('pauses a tool after a confirmation and shows the result', async ({ page }) => {
        await signInAs(page, { ...testUser, role: 'admin' });
        await mockRegistry(page);
        await mockApi(page, '**/api/admin/tools/stats*', () => ok(stats));
        let current = settings;
        let patch: unknown = null;
        await page.route('**/api/admin/tools/settings', (route) => {
            const request = route.request();
            if (request.method() === 'OPTIONS') return preflight(route);
            if (request.method() === 'PATCH') {
                patch = request.postDataJSON();
                current = { ...settings, tools: settings.tools.map((t) => (t.id === 'cve' ? { ...t, enabled: false, reason: 'admin_off' } : t)) };
            }
            return json(route, { success: true, data: current });
        });
        await page.goto('/admin/tools');
        await expect(page.getByTestId('admin-tool-row')).toHaveCount(2);
        await expect(page.getByTestId('stats-table')).toBeVisible();

        await page.getByRole('button', { name: 'Pause CVE Search' }).click();
        await expect(page.getByRole('dialog')).toContainText('Pause CVE Search?');
        await page.getByRole('button', { name: 'Pause tool' }).click();
        await expect(page.getByText('CVE Search is paused.')).toBeVisible();
        await expect(page.locator('[data-tool="cve"]')).toHaveAttribute('data-enabled', 'false');
        expect(patch).toEqual({ tools: { cve: { enabled: false } } });
    });

    test('shows a failed save as an error and keeps the screen usable', async ({ page }) => {
        await signInAs(page, { ...testUser, role: 'admin' });
        await mockRegistry(page);
        await mockApi(page, '**/api/admin/tools/stats*', () => ok(stats));
        await page.route('**/api/admin/tools/settings', (route) => {
            const request = route.request();
            if (request.method() === 'OPTIONS') return preflight(route);
            if (request.method() === 'PATCH') return json(route, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Bad cap', meta: {} } }, 400);
            return json(route, { success: true, data: settings });
        });
        await page.goto('/admin/tools');
        await page.locator('#cap-ssl').fill('50');
        await page.locator('[data-tool="ssl"]').getByRole('button', { name: 'Save' }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'Check the input' })).toBeVisible();
        await expect(page.getByTestId('admin-tool-row')).toHaveCount(2);
    });
});
