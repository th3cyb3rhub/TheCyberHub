import { test, expect } from '@playwright/test';
import { json, preflight } from './helpers';
import { freshState, mockLearningApi, MODULES } from './learning-mocks';

test.describe('Roadmap index', () => {
    test('lists published roadmaps from the API and keeps the filters in the address', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/roadmaps');

        await expect(page.getByRole('heading', { name: 'Roadmaps', exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: /Web application hacking/ }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /Blue team fundamentals/ }).first()).toBeVisible();

        await page.getByLabel('Category').selectOption('defensive');
        await expect(page).toHaveURL(/category=defensive/);
        await expect(page.getByRole('link', { name: /Web application hacking/ })).toHaveCount(0);
        await expect(page.getByRole('link', { name: /Blue team fundamentals/ }).first()).toBeVisible();
    });

    test('shows the API error with a retry instead of sample content', async ({ page }) => {
        await page.route('**/api/**', (route) => (route.request().method() === 'OPTIONS' ? preflight(route) : json(route, { success: false, error: { code: 'SERVER', message: 'Boom' } }, 500)));
        await page.goto('/roadmaps');
        await expect(page.getByRole('alert').first()).toBeVisible();
        await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
    });

    test('shows the empty state when nothing matches', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/roadmaps?q=zzzz');
        await expect(page.getByTestId('empty-state')).toBeVisible();
    });
});

test.describe('Roadmap detail as a visitor', () => {
    test('shows the steps, advisory order and a sign-in prompt', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/roadmaps/web-hacking');

        await expect(page.getByRole('heading', { name: 'Web application hacking', level: 1 })).toBeVisible();
        await expect(page.getByRole('heading', { name: /Foundations/ })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Sign in to track progress' })).toBeVisible();
        await expect(page.getByText(/Better after/).first()).toBeVisible();
    });

    test('sends a tick to sign in', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/roadmaps/web-hacking');
        await page.getByRole('button', { name: /Mark step 1 complete/ }).click();
        await expect(page).toHaveURL(/\/auth\?redirect=/);
    });

    test('says so when the roadmap does not exist', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/roadmaps/nope');
        await expect(page.getByText('This roadmap is not available')).toBeVisible();
    });

    test('moves a learning path opened as a roadmap to its own address', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/roadmaps/linux-basics');
        await expect(page).toHaveURL(/\/learning-paths\/linux-basics/);
    });
});

test.describe('Roadmap progress as a member', () => {
    test('starts, ticks a step, moves the next step and unticks', async ({ page }) => {
        const state = freshState();
        await mockLearningApi(page, { role: 'user', state });
        await page.goto('/roadmaps/web-hacking');

        await expect(page.getByRole('button', { name: /Start this roadmap/ })).toBeVisible();
        await page.getByRole('button', { name: /Mark step 1 complete/ }).click();
        await expect(page.getByTestId('progress-text')).toContainText('1 of 5 required steps · 20%');
        await expect(page.getByTestId('next-card')).toContainText('Set up Burp Suite');
        expect(state.calls.some((c) => c.path.endsWith('/modules/n-http/complete'))).toBe(true);

        await page.getByRole('button', { name: /Mark step 1 complete/ }).click();
        await expect(page.getByTestId('progress-text')).toContainText('0 of 5 required steps · 0%');
        expect(state.calls.some((c) => c.path.endsWith('/modules/n-http/uncomplete'))).toBe(true);
    });

    test('puts the tick back and shows the reason when the API refuses', async ({ page }) => {
        const state = freshState({ enrolled: true, ticked: ['n-http'] });
        await mockLearningApi(page, { role: 'user', state });
        await page.route('**/api/learning-paths/*/modules/*/complete', (route) =>
            route.request().method() === 'OPTIONS' ? preflight(route) : json(route, { success: false, error: { code: 'MODULE_NOT_FOUND', message: 'No such step' } }, 404));
        await page.goto('/roadmaps/web-hacking');

        await expect(page.getByTestId('progress-text')).toContainText('1 of 5');
        await page.getByRole('button', { name: /Mark step 2 complete/ }).click();
        await expect(page.getByText(/not part of this roadmap any more/)).toBeVisible();
        await expect(page.getByTestId('progress-text')).toContainText('1 of 5');
        await expect(page.getByRole('button', { name: /Mark step 2 complete/ })).toHaveAttribute('aria-pressed', 'false');
    });

    test('can tick a step that works best later, because order is advice', async ({ page }) => {
        await mockLearningApi(page, { role: 'user', state: freshState({ enrolled: true }) });
        await page.goto('/roadmaps/web-hacking');
        const locked = page.getByRole('button', { name: /Mark step 5 complete/ });
        await expect(locked).toBeEnabled();
        await locked.click();
        await expect(locked).toHaveAttribute('aria-pressed', 'true');
    });

    test('offers the certificate once every required step is done', async ({ page }) => {
        const required = MODULES.filter((m) => !m.optional).map((m) => m.id);
        await mockLearningApi(page, { role: 'user', state: freshState({ enrolled: true, ticked: required }) });
        await page.goto('/roadmaps/web-hacking');
        const link = page.getByRole('link', { name: /Get certificate/ });
        await expect(link).toHaveAttribute('href', '/certificates/CH-DEMO-2026');
        await link.click();
        await expect(page.getByTestId('certificate')).toBeVisible();
    });

    test('bookmarks a roadmap through the shared bookmark routes', async ({ page }) => {
        const state = freshState({ enrolled: true });
        await mockLearningApi(page, { role: 'user', state });
        await page.goto('/roadmaps/web-hacking');
        await page.getByRole('button', { name: /bookmark/i }).first().click();
        await expect.poll(() => state.calls.find((c) => c.path === '/api/bookmarks')?.body).toMatchObject({ contentType: 'roadmap' });
    });
});

test.describe('Certificates', () => {
    test('verifies a certificate publicly, case insensitively, without a login', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/certificates/ch-demo-2026');
        await expect(page.getByTestId('cert-recipient')).toContainText('@testuser');
        await expect(page.getByTestId('cert-title')).toContainText('Web application hacking');
        await expect(page.getByText('Valid certificate')).toBeVisible();
        await expect(page.getByRole('link', { name: 'View the roadmap' })).toHaveAttribute('href', '/roadmaps/web-hacking');
    });

    test('says so for an unknown certificate', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/certificates/unknown-id');
        await expect(page.getByText('Certificate not found')).toBeVisible();
    });
});

test.describe('Learning paths and the dashboard', () => {
    test('lists learning paths on the same components', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/learning-paths');
        await expect(page.getByRole('heading', { name: 'Learning paths', exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: /Linux for hackers/ }).first()).toHaveAttribute('href', '/learning-paths/linux-basics');
    });

    test('shows a path detail page', async ({ page }) => {
        await mockLearningApi(page, { role: 'user' });
        await page.goto('/learning-paths/linux-basics');
        await expect(page.getByRole('heading', { name: 'Linux for hackers', level: 1 })).toBeVisible();
        await expect(page.getByRole('button', { name: /Start this path/ })).toBeVisible();
    });

    test('the dashboard continues the roadmap in progress with its next step', async ({ page }) => {
        await mockLearningApi(page, { role: 'user', state: freshState({ enrolled: true, ticked: ['n-http'] }) });
        await page.goto('/dashboard');
        const block = page.getByTestId('dashboard-learning');
        await expect(block.getByRole('link', { name: /Web application hacking/ })).toHaveAttribute('href', '/roadmaps/web-hacking');
        await expect(block).toContainText('Set up Burp Suite');
    });

    test('the dashboard invites a new member to start a roadmap', async ({ page }) => {
        await mockLearningApi(page, { role: 'user' });
        await page.goto('/dashboard');
        await expect(page.getByTestId('dashboard-learning-empty')).toHaveAttribute('href', '/roadmaps');
    });
});

test.describe('Staff authoring', () => {
    test('keeps ordinary members out of the editor', async ({ page }) => {
        await mockLearningApi(page, { role: 'user' });
        await page.goto('/admin/learning-paths');
        await expect(page.getByText('You cannot open this page')).toBeVisible();
    });

    test('lists drafts with counts and opens the editor', async ({ page }) => {
        await mockLearningApi(page, { role: 'admin' });
        await page.goto('/admin/learning-paths');
        await expect(page.getByRole('tab', { name: /Drafts/ })).toContainText('1');
        await page.getByRole('link', { name: /^Edit Web application hacking/ }).click();
        await expect(page).toHaveURL(/\/admin\/learning-paths\/p-web/);
        await expect(page.getByRole('form', { name: 'Roadmap editor' })).toBeVisible();
        await expect(page.getByLabel('Title').first()).toHaveValue('Web application hacking');
    });

    test('a moderator can submit for review but not publish', async ({ page }) => {
        await mockLearningApi(page, { role: 'moderator' });
        await page.goto('/admin/learning-paths/p-web');
        await expect(page.getByRole('button', { name: /Submit for review/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /^Publish/ })).toHaveCount(0);
    });

    test('an admin publishes, and the feature control appears only once it is live', async ({ page }) => {
        await mockLearningApi(page, { role: 'admin' });
        await page.goto('/admin/learning-paths/p-web');
        await expect(page.getByRole('button', { name: /^Feature/ })).toHaveCount(0);
        await page.getByRole('button', { name: /^Publish/ }).click();
        await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /^Feature|^Unfeature/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /Unpublish/ })).toBeVisible();
    });

    test('shows the conflict dialog when someone else saved first and reloads their version', async ({ page }) => {
        const state = freshState({ conflictOnSave: true });
        await mockLearningApi(page, { role: 'admin', state });
        await page.goto('/admin/learning-paths/p-web');
        await page.getByLabel('Title').first().fill('My new title');
        await page.getByRole('button', { name: 'Save changes' }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('Someone else edited this roadmap')).toBeVisible();
        const put = state.calls.find((c) => c.method === 'PUT');
        expect(put?.body).toMatchObject({ ifUnmodifiedSince: '2026-11-01T10:00:00.000Z' });

        await dialog.getByRole('button', { name: 'Load the latest version' }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByLabel('Title').first()).toHaveValue('Web application hacking');
    });

    test('does not call the API for an invalid form', async ({ page }) => {
        const state = freshState();
        await mockLearningApi(page, { role: 'admin', state });
        await page.goto('/admin/learning-paths/p-web');
        await page.getByLabel('Title').first().fill('ab');
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByTestId('editor-error')).toContainText('Fix the highlighted fields');
        expect(state.calls.some((c) => c.method === 'PUT')).toBe(false);
    });
});
