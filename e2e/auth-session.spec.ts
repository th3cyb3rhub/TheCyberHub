import { test, expect, type Page } from '@playwright/test';
import { mockAuthApi, storeRefreshCookie, storeToken } from './auth-mocks';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// The page also has a route announcer with role alert
const alertIn = (page: Page) => page.locator('main').getByRole('alert');
const storedToken = (page: Page) => page.evaluate(() => window.localStorage.getItem('token'));

// The user menu opens on hover, which only exists with a mouse
const desktopOnly = (isMobile: boolean) => test.skip(isMobile, 'The user menu opens on hover');

test.describe('Access token renewal', () => {
    test('an expired token is renewed once and the original request is sent again', async ({ page }) => {
        const api = await mockAuthApi(page);
        await storeRefreshCookie(page);
        await storeToken(page, 'expired-token');
        await page.goto(`${BASE_URL}/profile/sessions`);

        await expect(page.getByText('Chrome on macOS')).toBeVisible();
        expect(api.calls('/api/auth/refresh')).toHaveLength(1);
        // The same call went out twice: refused with the old token, accepted with the new one
        const me = api.calls('/api/auth/me');
        expect(me.map((r) => r.token)).toEqual(['expired-token', 'fresh-token']);
        // The refresh carried the cookie, which the browser only sends with credentials, and no token in the body
        expect(api.calls('/api/auth/refresh')[0].credentials).toBe(true);
        expect(api.calls('/api/auth/refresh')[0].cookie).toContain('refreshToken=cookie-refresh');
        expect(api.calls('/api/auth/refresh')[0].body).toEqual({});
        expect(await storedToken(page)).toBe('fresh-token');
    });

    test('requests that fail together share one refresh', async ({ page }) => {
        // The token expires just after the account is read, while the dashboard asks for several things at once.
        // A slow refresh keeps every one of them waiting on the same refresh.
        const api = await mockAuthApi(page, { refreshDelayMs: 500, expireAfterMe: true });
        await storeToken(page, 'good-token');
        await page.goto(`${BASE_URL}/dashboard`);

        await expect.poll(() => api.seen.filter((r) => r.token === 'fresh-token').length).toBeGreaterThanOrEqual(3);
        const refused = api.seen.filter((r) => r.token === 'good-token' && r.path !== '/api/auth/me');
        expect(new Set(refused.map((r) => r.path)).size).toBeGreaterThanOrEqual(3);
        // Each refused call was sent again, once, with the new token
        for (const first of refused) {
            expect(api.seen.filter((r) => r.path === first.path && r.token === 'fresh-token')).toHaveLength(1);
        }
        expect(api.calls('/api/auth/refresh')).toHaveLength(1);
        expect(await storedToken(page)).toBe('fresh-token');
    });

    test('a refresh that fails sends a returning visitor to sign in, back to the page they wanted', async ({ page }) => {
        const api = await mockAuthApi(page, { refresh: { kind: 'invalid' } });
        await storeToken(page, 'expired-token');
        await page.goto(`${BASE_URL}/profile/sessions`);

        await page.waitForURL(/\/auth\?redirect=%2Fprofile%2Fsessions$/);
        await expect(page.getByText('You need to sign in to continue to')).toContainText('/profile/sessions');
        expect(api.calls('/api/auth/refresh')).toHaveLength(1);
        expect(await storedToken(page)).toBeNull();
    });

    test('a refresh race is retried without signing out', async ({ page }) => {
        const api = await mockAuthApi(page, { refresh: { kind: 'race', then: { kind: 'ok', token: 'fresh-token' } } });
        await storeToken(page, 'expired-token');
        await page.goto(`${BASE_URL}/profile/sessions`);
        await expect(page.getByText('Chrome on macOS')).toBeVisible();
        expect(await storedToken(page)).toBe('fresh-token');
        // The first refresh was refused as a race, the second one was answered
        expect(api.calls('/api/auth/refresh')).toHaveLength(2);
    });

    test('a server that is down during the refresh does not sign anyone out', async ({ page }) => {
        await mockAuthApi(page, { refresh: { kind: 'unavailable' } });
        await storeToken(page, 'expired-token');
        await page.goto(`${BASE_URL}/profile/sessions`);
        // The page cannot load their account, but the token is kept for the next try
        await page.waitForTimeout(1500);
        expect(await storedToken(page)).toBe('expired-token');
    });

    test('a session ended from another device signs this one out, with a note, and keeps the page', async ({ page }) => {
        const api = await mockAuthApi(page);
        await storeToken(page, 'good-token');
        await page.goto(`${BASE_URL}/profile/sessions`);
        await expect(page.getByText('Safari on iOS')).toBeVisible();

        api.state.revokedTokens.add('good-token');
        await page.getByRole('button', { name: /Sign out Safari on iOS/ }).click();

        await page.waitForURL(/\/auth\?redirect=%2Fprofile%2Fsessions$/);
        await expect(page.getByRole('status').filter({ hasText: 'This device was signed out' })).toBeVisible();
        expect(await storedToken(page)).toBeNull();
        // Not a token problem: nothing was renewed
        expect(api.calls('/api/auth/refresh')).toHaveLength(0);
    });
});

test.describe('Sign out', () => {
    test('signing out calls the server with the session token, then clears this browser', async ({ page, isMobile }) => {
        desktopOnly(isMobile);
        const api = await mockAuthApi(page);
        await storeToken(page, 'good-token');
        await page.goto(`${BASE_URL}/profile/sessions`);
        await expect(page.getByText('Chrome on macOS')).toBeVisible();

        await page.getByRole('button', { name: 'User menu' }).hover();
        await page.getByRole('button', { name: 'Sign Out', exact: true }).click();

        await expect.poll(() => api.calls('/api/auth/logout', 'POST').length).toBe(1);
        expect(api.calls('/api/auth/logout')[0].token).toBe('good-token');
        await expect.poll(() => storedToken(page)).toBeNull();
        // The sessions page no longer has anyone to show, so it asks them to sign in again
        await page.waitForURL(/\/auth\?redirect=%2Fprofile%2Fsessions$/);
    });

    test('sign out everywhere asks first, tells the server to end every session, and goes to sign-in', async ({ page }) => {
        const api = await mockAuthApi(page);
        await storeToken(page, 'good-token');
        await page.goto(`${BASE_URL}/profile/sessions`);
        await expect(page.getByText('Chrome on macOS')).toBeVisible();

        await page.getByRole('button', { name: 'Sign out everywhere' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText('every device, this one included');
        // Cancelling changes nothing
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        expect(api.calls('/api/auth/logout')).toHaveLength(0);

        await page.getByRole('button', { name: 'Sign out everywhere' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Sign out everywhere' }).click();

        await page.waitForURL(/\/auth$/);
        const logout = api.calls('/api/auth/logout', 'POST');
        expect(logout).toHaveLength(1);
        expect(logout[0].body).toEqual({ allDevices: true });
        expect(await storedToken(page)).toBeNull();
    });
});

test.describe('Sessions page', () => {
    test('shows each device, marks the current one and signs one out', async ({ page }) => {
        const api = await mockAuthApi(page);
        await storeToken(page, 'good-token');
        await page.goto(`${BASE_URL}/profile/sessions`);

        const rows = page.getByTestId('session-row');
        await expect(rows).toHaveCount(3);
        await expect(rows.first()).toContainText('Chrome on macOS');
        await expect(rows.first()).toContainText('Current session');
        await expect(rows.first()).toContainText('203.0.113.7');
        await expect(rows.first().getByRole('button')).toHaveCount(0);
        await expect(rows.nth(1)).toContainText('Safari on iOS');
        await expect(rows.nth(2)).toContainText('Firefox on Linux');

        await page.getByRole('button', { name: /Sign out Safari on iOS/ }).click();
        await expect(page.getByText('Signed out Safari on iOS.')).toBeVisible();
        await expect(rows).toHaveCount(2);
        const revoke = api.calls(`/api/auth/sessions/${'b'.repeat(32)}`, 'DELETE');
        expect(revoke).toHaveLength(1);
        expect(revoke[0].token).toBe('good-token');
    });

    test('signs out every other session and keeps this one', async ({ page }) => {
        const api = await mockAuthApi(page);
        await storeToken(page, 'good-token');
        await page.goto(`${BASE_URL}/profile/sessions`);
        await expect(page.getByTestId('session-row')).toHaveCount(3);

        await page.getByRole('button', { name: 'Sign out other sessions' }).click();
        await expect(page.getByText('Signed out 2 other sessions.')).toBeVisible();
        await expect(page.getByTestId('session-row')).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Sign out other sessions' })).toBeDisabled();
        expect(api.calls('/api/auth/sessions/others', 'DELETE')).toHaveLength(1);
        expect(await storedToken(page)).toBe('good-token');
    });

    test('says so when the list cannot be loaded, and loads it on retry', async ({ page }) => {
        const api = await mockAuthApi(page);
        await storeToken(page, 'good-token');
        let failNext = true;
        await page.route('**/api/auth/sessions', async (route) => {
            if (route.request().method() === 'GET' && failNext) {
                failNext = false;
                return route.fulfill({
                    status: 403,
                    contentType: 'application/json',
                    headers: { 'access-control-allow-origin': route.request().headers()['origin'] ?? '*', 'access-control-allow-credentials': 'true' },
                    body: JSON.stringify({ success: false, error: { code: 'AUTHZ_FORBIDDEN', message: 'You cannot list sessions right now' } }),
                });
            }
            return route.fallback();
        });
        await page.goto(`${BASE_URL}/profile/sessions`);
        await expect(alertIn(page)).toContainText('You cannot list sessions right now');
        await page.getByRole('button', { name: 'Try again' }).click();
        await expect(page.getByTestId('session-row')).toHaveCount(3);
        expect(api.calls('/api/auth/sessions', 'GET').length).toBeGreaterThanOrEqual(1);
    });

    test('the profile security tab links to it', async ({ page }) => {
        await mockAuthApi(page);
        await storeToken(page, 'good-token');
        await page.goto(`${BASE_URL}/profile?tab=security`);
        await page.getByRole('link', { name: 'Manage sessions' }).click();
        await page.waitForURL(/\/profile\/sessions$/);
        await expect(page.getByRole('heading', { name: 'Active sessions', level: 1 })).toBeVisible();
    });
});

test.describe('Password change', () => {
    test('stores the new access token the change answers, and keeps the member signed in on it', async ({ page }) => {
        const api = await mockAuthApi(page);
        await storeToken(page, 'good-token');
        await page.goto(`${BASE_URL}/profile?tab=security`);
        await page.getByLabel('Current Password').fill('Old-password-1!');
        await page.getByLabel('New Password', { exact: true }).fill('New-password-1!');
        await page.getByLabel('Confirm New Password').fill('New-password-1!');
        await page.getByRole('button', { name: 'Update Password' }).click();

        await expect.poll(() => storedToken(page)).toBe('password-token');
        expect(api.calls('/api/auth/password', 'PUT')).toHaveLength(1);
        // And the next call is made with it (a client-side visit: a reload would run the stored-token init script again)
        await page.getByRole('link', { name: 'Manage sessions' }).click();
        await expect(page.getByText('Chrome on macOS')).toBeVisible();
        expect(api.calls('/api/auth/sessions', 'GET').at(-1)?.token).toBe('password-token');
    });
});

test.describe('Two-step sign-in', () => {
    test('asks for the code after the password, then signs in and goes to the page they wanted', async ({ page }) => {
        const api = await mockAuthApi(page, { login: 'requires2FA' });
        await page.goto(`${BASE_URL}/auth?redirect=${encodeURIComponent('/badges')}`);

        await page.getByLabel('Email').fill('test@example.com');
        await page.getByLabel('Password', { exact: true }).fill('Correct-horse-1!');
        await page.locator('button[type="submit"]').click();

        await expect(page.getByRole('heading', { name: 'Two-Factor Auth' })).toBeVisible();
        // The password step made no session: no token yet, and nothing was renewed
        expect(await storedToken(page)).toBeNull();
        expect(api.calls('/api/auth/login')[0].body).toEqual({ email: 'test@example.com', password: 'Correct-horse-1!' });

        // A wrong code is a form error, not a sign-out and not a renewal
        await page.getByLabel('Authenticator Code').fill('000000');
        await page.locator('button[type="submit"]').click();
        await expect(alertIn(page).filter({ hasText: 'Invalid 2FA code' })).toBeVisible();
        expect(api.calls('/api/auth/refresh')).toHaveLength(0);

        await page.getByLabel('Authenticator Code').fill('123456');
        await page.locator('button[type="submit"]').click();
        await page.waitForURL(/\/badges$/);
        expect(api.calls('/api/auth/2fa/verify').at(-1)?.body).toEqual({ tempToken: 'temp-opaque', code: '123456' });
        expect(await storedToken(page)).toBe('login-token');
    });

    test('an expired second step goes back to the password step with a message', async ({ page }) => {
        const api = await mockAuthApi(page, { login: 'requires2FA', challengeExpired: true });
        await page.goto(`${BASE_URL}/auth`);
        await page.getByLabel('Email').fill('test@example.com');
        await page.getByLabel('Password', { exact: true }).fill('Correct-horse-1!');
        await page.locator('button[type="submit"]').click();
        await page.getByLabel('Authenticator Code').fill('123456');
        await page.locator('button[type="submit"]').click();

        await expect(alertIn(page)).toContainText('expired');
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
        await expect(page.getByLabel('Authenticator Code')).toHaveCount(0);
        // Not a token problem: nothing was renewed
        expect(api.calls('/api/auth/refresh')).toHaveLength(0);
    });

    test('a refused password shows the server message and does not try to renew anything', async ({ page }) => {
        const api = await mockAuthApi(page, { login: 'refused' });
        await page.goto(`${BASE_URL}/auth`);
        await page.getByLabel('Email').fill('test@example.com');
        await page.getByLabel('Password', { exact: true }).fill('Wrong-password-1!');
        await page.locator('button[type="submit"]').click();
        await expect(alertIn(page).filter({ hasText: 'Invalid credentials' })).toBeVisible();
        expect(api.calls('/api/auth/refresh')).toHaveLength(0);
        expect(await storedToken(page)).toBeNull();
    });
});

test.describe('The redirect parameter', () => {
    for (const target of ['//evil.example', '/\\evil.example', 'https://evil.example', '/%2F/evil.example', '/auth?redirect=%2Fprofile']) {
        test(`sends a member to their profile, not to ${target}`, async ({ page }) => {
            await mockAuthApi(page);
            const offSite: string[] = [];
            await page.route(/^https?:\/\/evil\.example(\/|$)/, (route) => { offSite.push(route.request().url()); return route.abort(); });
            await page.goto(`${BASE_URL}/auth?redirect=${encodeURIComponent(target)}`);

            await page.getByLabel('Email').fill('test@example.com');
            await page.getByLabel('Password', { exact: true }).fill('Correct-horse-1!');
            await page.locator('button[type="submit"]').click();

            await page.waitForURL(/\/profile$/);
            expect(new URL(page.url()).origin).toBe(new URL(BASE_URL).origin);
            expect(offSite).toEqual([]);
        });
    }

    test('keeps a safe same-site path', async ({ page }) => {
        await mockAuthApi(page);
        await page.goto(`${BASE_URL}/auth?redirect=${encodeURIComponent('/badges?tab=mine')}`);
        await page.getByLabel('Email').fill('test@example.com');
        await page.getByLabel('Password', { exact: true }).fill('Correct-horse-1!');
        await page.locator('button[type="submit"]').click();
        await page.waitForURL(/\/badges\?tab=mine$/);
    });
});

test.describe('OAuth callbacks', () => {
    test('a provider error says so and offers the way back to sign-in', async ({ page }) => {
        await mockAuthApi(page);
        await page.goto(`${BASE_URL}/auth/callback/github?error=access_denied`);
        await expect(alertIn(page)).toContainText('You cancelled the sign-in');
        await page.getByRole('link', { name: 'Back to sign in' }).click();
        await page.waitForURL(/\/auth$/);
    });

    test('a GitHub code is exchanged once and the member lands on the page they were heading for', async ({ page }) => {
        const api = await mockAuthApi(page);
        await page.addInitScript(() => window.sessionStorage.setItem('oauthReturnTo', '/badges'));
        await page.goto(`${BASE_URL}/auth/callback/github?code=abc123`);
        await page.waitForURL(/\/badges$/);
        const exchanges = api.calls('/api/auth/oauth/github', 'POST');
        expect(exchanges).toHaveLength(1);
        expect(exchanges[0].body).toEqual({ code: 'abc123' });
        expect(await storedToken(page)).toBe('oauth-token');
    });

    test('the Google token does not stay in the address bar once it has been sent', async ({ page }) => {
        const api = await mockAuthApi(page);
        await page.goto(`${BASE_URL}/auth/callback/google#id_token=google-id-token&state=x`);
        await expect.poll(() => api.calls('/api/auth/oauth/google', 'POST').length).toBe(1);
        expect(api.calls('/api/auth/oauth/google')[0].body).toEqual({ idToken: 'google-id-token' });
        expect(page.url()).not.toContain('id_token');
        await page.waitForURL((url) => !url.pathname.startsWith('/auth/callback'));
        // Going back does not return to a page that still holds the token
        await page.goBack();
        expect(page.url()).not.toContain('id_token');
    });

    test('is readable in both themes', async ({ page }) => {
        await mockAuthApi(page);
        for (const theme of ['light', 'dark'] as const) {
            await page.addInitScript((value) => window.localStorage.setItem('tch-theme', value), theme);
            await page.goto(`${BASE_URL}/auth/callback/google`);
            const alert = alertIn(page);
            await expect(alert).toContainText('Google did not send a sign-in token.');
            const [background, color] = await alert.evaluate((el) => {
                const card = el.parentElement as HTMLElement;
                return [getComputedStyle(card).backgroundColor, getComputedStyle(el.querySelector('h1') as HTMLElement).color];
            });
            expect(background).not.toBe(color);
        }
    });
});

test.describe('Password strength hint', () => {
    test('tells a new member what is still missing and never blocks typing', async ({ page }) => {
        await mockAuthApi(page);
        await page.goto(`${BASE_URL}/auth`);
        await page.getByRole('button', { name: 'Register' }).click();
        await page.getByLabel('Password', { exact: true }).fill('abcdefgh');
        const status = page.getByTestId('password-strength').getByRole('status');
        await expect(status).toContainText('Password strength: Weak');
        await expect(status).toContainText('uppercase letter, number, special character');
        await page.getByLabel('Password', { exact: true }).fill('Tr1cky-Horse-Staple-9');
        await expect(status).toHaveText('Password strength: Strong.');
    });
});
