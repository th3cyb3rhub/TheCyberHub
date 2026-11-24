import { test, expect } from '@playwright/test';
import { json, preflight } from './helpers';
import { freshState, mockLearningApi } from './learning-mocks';

test.describe('Resource library', () => {
    test('lists approved resources, filters them and keeps the filters in the address', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/resources');

        await expect(page.getByRole('heading', { name: 'Resource library' })).toBeVisible();
        await expect(page.getByRole('link', { name: /OWASP Top 10/ }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /Blue Team Handbook/ }).first()).toBeVisible();

        await page.getByLabel('Type').selectOption('course');
        await expect(page).toHaveURL(/type=course/);
        await expect(page.getByRole('link', { name: /Blue Team Handbook/ })).toHaveCount(0);
        await expect(page.getByRole('link', { name: /Web Security Academy/ }).first()).toBeVisible();

        await page.getByRole('button', { name: /Clear filters/ }).first().click();
        await expect(page).not.toHaveURL(/type=/);
    });

    test('searches after a pause in typing', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/resources');
        await page.getByLabel('Search resources').fill('academy');
        await expect(page).toHaveURL(/q=academy/);
        await expect(page.getByRole('link', { name: /OWASP Top 10/ })).toHaveCount(0);
    });

    test('shows the API error with a retry', async ({ page }) => {
        await page.route('**/api/**', (route) => (route.request().method() === 'OPTIONS' ? preflight(route) : json(route, { success: false, error: { code: 'SERVER', message: 'Boom' } }, 500)));
        await page.goto('/resources');
        await expect(page.getByRole('alert').first()).toBeVisible();
    });
});

test.describe('Resource detail', () => {
    test('opens the link safely and lists where it is used', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/resources/owasp-top-10');
        await expect(page.getByRole('heading', { name: 'OWASP Top 10', level: 1 })).toBeVisible();
        const visit = page.getByTestId('visit');
        await expect(visit).toHaveAttribute('href', 'https://owasp.org/Top10');
        await expect(visit).toHaveAttribute('target', '_blank');
        expect(await visit.getAttribute('rel')).toMatch(/noopener noreferrer/);
        await expect(page.getByRole('link', { name: 'Web application hacking' })).toHaveAttribute('href', '/roadmaps/web-hacking');
        await expect(page.getByRole('button', { name: 'Sign in to vote and save' })).toBeVisible();
    });

    test('a member votes and the score follows the API', async ({ page }) => {
        const state = freshState();
        await mockLearningApi(page, { role: 'user', state });
        await page.goto('/resources/owasp-top-10');
        await expect(page.getByTestId('score')).toHaveText('23');
        await page.getByRole('button', { name: /Upvote/ }).click();
        await expect(page.getByTestId('score')).toHaveText('24');
        expect(state.calls.find((c) => c.path.endsWith('/vote'))?.body).toEqual({ value: 1 });
    });

    test('a member reports a resource with a reason', async ({ page }) => {
        const state = freshState();
        await mockLearningApi(page, { role: 'user', state });
        await page.goto('/resources/owasp-top-10');
        await page.getByRole('button', { name: /Report/ }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('button', { name: 'Send report' })).toBeDisabled();
        await dialog.getByRole('radio', { name: /Spam/ }).check();
        await dialog.getByRole('button', { name: 'Send report' }).click();
        await expect(dialog).toHaveCount(0);
        expect(state.calls.find((c) => c.path.endsWith('/report'))?.body).toMatchObject({ reason: 'spam' });
    });

    test('says so for an unknown resource', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/resources/nope');
        await expect(page.getByText('Resource not found')).toBeVisible();
    });
});

test.describe('Submitting a resource', () => {
    test('sends a visitor to sign in first', async ({ page }) => {
        await mockLearningApi(page, { role: null });
        await page.goto('/resources/submit');
        await expect(page).toHaveURL(/\/auth\?redirect=%2Fresources%2Fsubmit/);
    });

    test('validates the form, warns about a duplicate and then submits', async ({ page }) => {
        const state = freshState();
        await mockLearningApi(page, { role: 'user', state });
        await page.goto('/resources/submit');

        await page.getByRole('button', { name: 'Submit for review' }).click();
        await expect(page.getByTestId('form-error')).toContainText('Fix the highlighted fields');
        expect(state.calls.some((c) => c.path === '/api/resources')).toBe(false);

        await page.getByLabel('Link').fill('https://owasp.org/Top10');
        await page.getByLabel('Link').blur();
        await expect(page.getByTestId('duplicate')).toContainText('Already in the library');
        await expect(page.getByRole('button', { name: 'Submit for review' })).toBeDisabled();

        await page.getByLabel('Title').fill('A practical XSS guide');
        await page.getByLabel('Link').fill('https://example.org/xss');
        await page.getByLabel('Link').blur();
        await expect(page.getByText(/not in the library yet/)).toBeVisible();
        await page.getByLabel('Type').selectOption('article');
        await page.getByLabel('Topic').selectOption('web-security');
        await page.getByLabel('Difficulty').selectOption('beginner');
        await page.getByLabel(/Why is it worth it/).fill('A clear walk through reflected, stored and DOM XSS with examples.');
        await page.getByRole('button', { name: 'Submit for review' }).click();
        await expect(page.getByTestId('submitted')).toContainText('Submitted for review');
        expect(state.calls.find((c) => c.path === '/api/resources')?.body).toMatchObject({ title: 'A practical XSS guide', url: 'https://example.org/xss', type: 'article' });
    });

    test('shows my submissions with their status and the rejection reason', async ({ page }) => {
        await mockLearningApi(page, { role: 'user' });
        await page.goto('/resources/my');
        const list = page.getByTestId('my-submissions');
        await expect(list).toContainText('My pending guide');
        await expect(list).toContainText('Waiting for review');
        await expect(list).toContainText('Already covered by the Web Security Academy.');
    });
});

test.describe('Resource review queue', () => {
    test('keeps ordinary members out', async ({ page }) => {
        await mockLearningApi(page, { role: 'user' });
        await page.goto('/admin/resources');
        await expect(page.getByText('You cannot open this page')).toBeVisible();
    });

    test('a moderator approves one submission and rejects another with a reason', async ({ page }) => {
        const state = freshState();
        await mockLearningApi(page, { role: 'moderator', state });
        await page.goto('/admin/resources');

        const rows = page.getByTestId('queue-row');
        await expect(rows).toHaveCount(2);
        await rows.first().getByRole('button', { name: /Approve/ }).click();
        await expect.poll(() => state.calls.some((c) => c.path.endsWith('/approve'))).toBe(true);

        await page.getByTestId('queue-row').first().getByRole('button', { name: /Reject/ }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Reason').selectOption('low_quality');
        await dialog.getByRole('button', { name: 'Reject' }).click();
        await expect.poll(() => state.calls.find((c) => c.path.endsWith('/reject'))?.body).toMatchObject({ reason: 'low_quality' });
    });

    test('opens the reported and broken queues', async ({ page }) => {
        await mockLearningApi(page, { role: 'moderator' });
        await page.goto('/admin/resources');
        await page.getByRole('tab', { name: /Reported/ }).click();
        await expect(page.getByTestId('queue-row')).toHaveCount(1);
        await expect(page.getByTestId('queue-row')).toContainText('2 open reports');
        await page.getByRole('tab', { name: /Broken links/ }).click();
        await expect(page.getByTestId('queue-row')).toHaveCount(1);
    });
});
