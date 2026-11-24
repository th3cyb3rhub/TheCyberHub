import { test, expect, type Page } from '@playwright/test';
import {
    CLOSED_ID, DRAFT_ID, LIVE_ID, PENDING_ID, QUEUED_A, QUEUED_B, REJECTED_ID, freshState, mockJobsApi, type MockState, type Who,
} from './jobs-mocks';

/**
 * The mock API answers every browser call. The server render fails soft here (no backend runs), so
 * the browser loads each page; the redirect, the 404 status, the JobPosting data and the company
 * page are rendered by the server alone, so the unit tests cover them and they need the real API.
 */
/** An employer whose company is not verified yet: every submitted job waits for a reviewer */
const unverified = () => {
    const state = freshState();
    state.companies.find((c) => c.slug === 'acme-security')!.status = 'pending';
    return state;
};

async function open(page: Page, who: Who, path: string, state: MockState = freshState()) {
    await mockJobsApi(page, who, state);
    await page.goto(path);
    return state;
}

const noHorizontalScroll = async (page: Page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
};

for (const width of [390, 1280]) {
    test.describe(`Jobs at ${width}px`, () => {
        test.use({ viewport: { width, height: width < 600 ? 844 : 800 } });

        test.describe('anonymous visitor', () => {
            test('lists only public jobs, filters through the address and has no save buttons', async ({ page }) => {
                await open(page, 'visitor', '/jobs');
                await expect(page.getByRole('heading', { name: 'Find your next security role', level: 1 })).toBeVisible();
                await expect(page.getByTestId('job-card')).toHaveCount(2);
                await expect(page.getByText('Draft Role Of Mine')).toHaveCount(0);
                await expect(page.getByText('Queued Role Alpha')).toHaveCount(0);
                await expect(page.getByTestId('save-job')).toHaveCount(0);
                await noHorizontalScroll(page);

                if (width < 600) await page.getByRole('button', { name: /Filters/ }).click();
                await page.getByLabel('Category').selectOption('soc');
                await expect(page).toHaveURL(/category=soc/);
                await expect(page.getByTestId('job-card')).toHaveCount(1);
                await expect(page.getByTestId('job-card')).toContainText('SOC Analyst');

                await page.getByRole('button', { name: 'Clear filters' }).click();
                await expect(page.getByTestId('job-card')).toHaveCount(2);
            });

            test('opens a filtered address with the filter applied', async ({ page }) => {
                await open(page, 'visitor', '/jobs?category=soc');
                await expect(page.getByTestId('job-card')).toHaveCount(1);
                await expect(page.getByLabel('Category')).toHaveValue('soc');
            });

            test('shows the job, counts the apply click and opens the employer site without a handle on the page', async ({ page }) => {
                const state = await open(page, 'visitor', '/jobs/senior-pentester-aaaaaa');
                await expect(page.getByRole('heading', { name: 'Senior Pentester', level: 1 })).toBeVisible();
                await expect(page.getByRole('link', { name: /Sign in to save/ })).toBeVisible();
                await expect(page.getByTestId('report-job')).toHaveCount(0);
                await noHorizontalScroll(page);

                await page.context().route('https://careers.acme-security.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Apply</title>' }));
                const popup = page.waitForEvent('popup');
                await page.getByTestId('apply').first().click();
                const opened = await popup;
                await expect(opened).toHaveURL('https://careers.acme-security.com/apply/1');
                // `noopener`: the employer's site has no handle on this page
                expect(await opened.evaluate(() => window.opener)).toBeNull();
                expect(state.calls.some((c) => c.method === 'POST' && c.path === `/api/jobs/${LIVE_ID}/apply`)).toBe(true);

                const fallback = page.getByTestId('apply-result').first().getByRole('link');
                await expect(fallback).toHaveAttribute('rel', /noopener/);
                await expect(fallback).toHaveAttribute('rel', /noreferrer/);
            });

            test('is not found for a job that is not public', async ({ page }) => {
                await open(page, 'visitor', '/jobs/draft-role-of-mine-cccccc');
                await expect(page.getByRole('heading', { name: 'This job is not available' })).toBeVisible();
                await expect(page.getByText('Draft Role Of Mine')).toHaveCount(0);
            });
        });

        test.describe('member', () => {
            test('saves a job at once, finds it on the saved page and takes it off again', async ({ page }) => {
                const state = await open(page, 'member', '/jobs');
                const first = page.getByTestId('job-card').first();
                const save = first.getByTestId('save-job');
                await expect(save).toHaveAttribute('aria-pressed', 'false');
                await save.click();
                await expect(save).toHaveAttribute('aria-pressed', 'true');
                expect(state.saved.size).toBe(1);

                await page.getByRole('link', { name: /Saved jobs/ }).click();
                await expect(page).toHaveURL(/\/jobs\/saved/);
                await expect(page.getByTestId('saved-list').getByTestId('job-card')).toHaveCount(1);
                await page.getByTestId('saved-list').getByTestId('save-job').click();
                await expect(page.getByText('No saved jobs')).toBeVisible();
                expect(state.saved.size).toBe(0);
            });

            test('puts the star back and says why when saving fails', async ({ page }) => {
                const state = freshState({ failOnce: { 'POST bookmarks': { status: 404, code: 'JOB_NOT_FOUND', message: 'gone' } } });
                await open(page, 'member', '/jobs', state);
                const save = page.getByTestId('job-card').first().getByTestId('save-job');
                await save.click();
                await expect(save).toHaveAttribute('aria-pressed', 'false');
                await expect(page.getByText(/not available/).first()).toBeVisible();
            });

            test('reports a job: needs a reason, thanks the member, then says it is already reported', async ({ page }) => {
                const state = await open(page, 'member', '/jobs/senior-pentester-aaaaaa');
                await page.getByTestId('report-job').click();
                const dialog = page.getByRole('dialog');
                await expect(dialog.getByRole('button', { name: 'Send report' })).toBeDisabled();
                await dialog.getByRole('radio', { name: /Scam/ }).check();
                await dialog.getByLabel(/Details/).fill('Asks for a deposit');
                await dialog.getByRole('button', { name: 'Send report' }).click();
                await expect(dialog).toHaveCount(0);
                await expect(page.getByText('Report sent')).toBeVisible();
                expect(state.calls.find((c) => c.path.endsWith('/report'))?.body).toEqual({ reason: 'scam', details: 'Asks for a deposit' });

                await page.getByTestId('report-job').click();
                await page.getByRole('dialog').getByRole('radio', { name: /Spam/ }).check();
                await page.getByRole('dialog').getByRole('button', { name: 'Send report' }).click();
                await expect(page.getByTestId('report-error')).toContainText('already reported');
            });

            test('has a keyboard route into the report dialog and out with Escape', async ({ page }) => {
                await open(page, 'member', '/jobs/senior-pentester-aaaaaa');
                const opener = page.getByTestId('report-job');
                await opener.focus();
                await page.keyboard.press('Enter');
                await expect(page.getByRole('dialog')).toBeVisible();
                await page.keyboard.press('Escape');
                await expect(page.getByRole('dialog')).toHaveCount(0);
                await expect(opener).toBeFocused();
            });

            test('is sent away from the employer area with a way to become an employer', async ({ page }) => {
                await open(page, 'member', '/employer');
                await expect(page.getByRole('link', { name: 'Become an employer' })).toBeVisible();
            });

            test('registers a company and lands on the employer dashboard', async ({ page }) => {
                const state = await open(page, 'member', '/employer/setup');
                await page.getByLabel(/Company name/).fill('Acme Labs');
                await page.getByTestId('save-company').click();
                await expect(page).toHaveURL(/\/employer$/);
                expect(state.calls.find((c) => c.path === '/api/companies/become-employer')?.body).toMatchObject({ name: 'Acme Labs' });
                await expect(page.getByRole('heading', { name: 'Employer dashboard', level: 1 })).toBeVisible();
            });

            test('shows the organisation email message when the server refuses', async ({ page }) => {
                const state = freshState({ failOnce: { 'POST become-employer': { status: 403, code: 'EMPLOYER_EMAIL_NOT_ORG', message: 'x' } } });
                await open(page, 'member', '/employer/setup', state);
                await page.getByLabel(/Company name/).fill('Acme Labs');
                await page.getByTestId('save-company').click();
                await expect(page.getByTestId('form-banner')).toContainText(/Free mail providers/);
                await expect(page).toHaveURL(/\/employer\/setup/);
            });
        });

        test.describe('employer', () => {
            test('shows every status with its chip, the reviewer reason and the right actions', async ({ page }) => {
                await open(page, 'employer', '/employer');
                await expect(page.getByRole('heading', { name: 'Employer dashboard', level: 1 })).toBeVisible();
                const rows = page.getByTestId('employer-job');
                await expect(rows).toHaveCount(4);
                await expect(rows.filter({ hasText: 'Draft Role Of Mine' }).getByTestId('job-status')).toHaveText('Draft');
                await expect(rows.filter({ hasText: 'Pending Role Of Mine' }).getByTestId('job-status')).toHaveText('Under review');
                const rejected = rows.filter({ hasText: 'Rejected Role Of Mine' });
                await expect(rejected.getByTestId('job-status')).toHaveText('Rejected');
                await expect(rejected.getByTestId('reject-reason')).toContainText('Add a real apply link and the pay range');
                await expect(rejected.getByTestId('fix-resubmit')).toBeVisible();
                await expect(rows.filter({ hasText: 'Closed Role Of Mine' }).getByTestId('reopen-job')).toBeVisible();
                await noHorizontalScroll(page);
            });

            test('walks a job through its life: draft, review, close, reopen, delete', async ({ page }) => {
                const state = await open(page, 'employer', '/employer', unverified());
                const job = (name: string) => page.getByTestId('employer-job').filter({ hasText: name });

                await job('Draft Role Of Mine').getByTestId('submit-job').click();
                await expect(job('Draft Role Of Mine').getByTestId('job-status')).toHaveText('Under review');
                expect(state.calls.some((c) => c.path === `/api/jobs/${DRAFT_ID}/submit`)).toBe(true);

                await job('Pending Role Of Mine').getByTestId('close-job').click();
                await expect(job('Pending Role Of Mine').getByTestId('job-status')).toHaveText('Closed');
                expect(state.calls.some((c) => c.path === `/api/jobs/${PENDING_ID}/close`)).toBe(true);

                await job('Closed Role Of Mine').getByTestId('reopen-job').click();
                await page.getByLabel('Keep it public for').selectOption('60');
                await page.getByTestId('confirm-reopen').click();
                await expect(job('Closed Role Of Mine').getByTestId('job-status')).toHaveText('Under review');
                expect((state.calls.find((c) => c.path === `/api/jobs/${CLOSED_ID}/reopen`)?.body as { expiresAt: string }).expiresAt).toMatch(/^\d{4}-/);

                await job('Rejected Role Of Mine').getByTestId('delete-job').click();
                await page.getByRole('button', { name: 'Delete' }).last().click();
                await expect(job('Rejected Role Of Mine')).toHaveCount(0);
                expect(state.jobs.some((j) => j._id === REJECTED_ID)).toBe(false);
            });

            test('posts a job: limits first, then the server, then review', async ({ page }) => {
                const state = await open(page, 'employer', '/employer/post', unverified());
                await page.getByTestId('save-job-form').click();
                await expect(page.getByTestId('form-banner')).toContainText('2 problems');
                await expect(page.getByLabel(/Job title/)).toBeFocused();

                await page.getByLabel(/Job title/).fill('Cloud Security Engineer');
                await page.getByLabel(/^Description/).fill('Own the security of our cloud estate, from the account structure down to the pipelines that ship it.');
                await page.getByLabel(/Application link/).fill('https://careers.acme-security.com/cloud');
                await page.getByTestId('save-job-form').click();
                await expect(page).toHaveURL(/\/employer$/);
                await expect(page.getByTestId('employer-job').filter({ hasText: 'Cloud Security Engineer' }).getByTestId('job-status')).toHaveText('Under review');
                const body = state.calls.find((c) => c.method === 'POST' && c.path === '/api/jobs')?.body;
                expect(body).toMatchObject({ title: 'Cloud Security Engineer', applyUrl: 'https://careers.acme-security.com/cloud' });
                expect(body).not.toHaveProperty('company');
            });

            test('saves a draft', async ({ page }) => {
                const state = await open(page, 'employer', '/employer/post', unverified());
                await page.getByLabel(/Job title/).fill('Detection Engineer');
                await page.getByLabel(/^Description/).fill('Write and tune the detections that find intruders in a large environment, with the SOC team.');
                await page.getByTestId('save-draft').click();
                await expect(page).toHaveURL(/\/employer$/);
                expect(state.calls.find((c) => c.method === 'POST' && c.path === '/api/jobs')?.body).toMatchObject({ saveAsDraft: true });
                await expect(page.getByTestId('employer-job').filter({ hasText: 'Detection Engineer' }).getByTestId('job-status')).toHaveText('Draft');
            });

            test('keeps what was typed and shows the cap message when the job limit is reached', async ({ page }) => {
                const state = freshState({ failOnce: { 'POST jobs': { status: 409, code: 'JOB_LIMIT_REACHED', message: 'x', meta: { limit: 10 } } } });
                await open(page, 'employer', '/employer/post', state);
                await page.getByLabel(/Job title/).fill('Cloud Security Engineer');
                await page.getByLabel(/^Description/).fill('Own the security of our cloud estate, from the account structure down to the pipelines that ship it.');
                await page.getByTestId('save-job-form').click();
                await expect(page.getByTestId('form-banner')).toContainText('10 open jobs');
                await expect(page.getByLabel(/Job title/)).toHaveValue('Cloud Security Engineer');
            });

            test('fixes a rejected job and resubmits it in one step', async ({ page }) => {
                const state = await open(page, 'employer', '/employer', unverified());
                await page.getByTestId('employer-job').filter({ hasText: 'Rejected Role Of Mine' }).getByTestId('fix-resubmit').click();
                await expect(page).toHaveURL(new RegExp(`/employer/edit/${REJECTED_ID}`));
                await expect(page.getByTestId('rejected-note')).toContainText('Add a real apply link and the pay range');
                await page.getByLabel('Lowest pay').fill('95000');
                await page.getByTestId('save-resubmit').click();
                await expect(page).toHaveURL(/\/employer$/);
                await expect(page.getByTestId('employer-job').filter({ hasText: 'Rejected Role Of Mine' }).getByTestId('job-status')).toHaveText('Under review');
                const order = state.calls.filter((c) => c.path.includes(REJECTED_ID)).map((c) => `${c.method} ${c.path.split('/').pop()}`);
                expect(order).toEqual(expect.arrayContaining([`PUT ${REJECTED_ID}`, 'POST submit']));
                expect(order.indexOf(`PUT ${REJECTED_ID}`)).toBeLessThan(order.indexOf('POST submit'));
            });

            test('lets the poster read a job that is waiting for review, with its status', async ({ page }) => {
                await open(page, 'employer', '/jobs/pending-role-of-mine-dddddd');
                await expect(page.getByRole('heading', { name: 'Pending Role Of Mine', level: 1 })).toBeVisible();
                await expect(page.getByTestId('viewer-banner')).toContainText('Under review');
                await expect(page.getByTestId('apply')).toHaveCount(0);
            });

            test('edits the company profile', async ({ page }) => {
                const state = await open(page, 'employer', '/employer/company');
                await expect(page.getByTestId('company-review')).toContainText('Verified');
                await page.getByLabel(/Company name/).fill('Acme Security Labs');
                await page.getByTestId('save-company').click();
                await expect(page.getByText(/Saved|saved/).first()).toBeVisible();
                expect(state.calls.find((c) => c.path === '/api/companies/my/profile' && c.method === 'POST')?.body).toMatchObject({ name: 'Acme Security Labs' });
            });
        });

        test.describe('reviewer', () => {
            test('keeps a member out of the review screen', async ({ page }) => {
                await open(page, 'member', '/admin/jobs');
                await expect(page.getByText(/Only moderators and administrators/)).toBeVisible();
            });

            test('shows the queue with the counters, the full job as text, and approves one', async ({ page }) => {
                const state = await open(page, 'moderator', '/admin/jobs');
                await expect(page.getByRole('heading', { name: 'Jobs review', level: 1 })).toBeVisible();
                const rows = page.getByTestId('admin-job');
                await expect(rows).toHaveCount(3);
                await expect(page.getByTestId('admin-stat-waiting-for-review')).toHaveText('3');
                await noHorizontalScroll(page);

                const beta = rows.filter({ hasText: 'Queued Role Beta' });
                await beta.getByTestId('toggle-review').click();
                await expect(beta.getByTestId('review-detail')).toContainText('Nora Newco');
                await expect(beta.getByTestId('review-detail')).toContainText('window.__pwned = true');
                expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();

                await rows.filter({ hasText: 'Queued Role Alpha' }).getByTestId('approve-job').click();
                await expect(rows.filter({ hasText: 'Queued Role Alpha' })).toHaveCount(0);
                expect(state.jobs.find((j) => j._id === QUEUED_A)?.status).toBe('approved');
            });

            test('rejects with a reason, and the poster later reads it', async ({ page }) => {
                const state = await open(page, 'moderator', '/admin/jobs');
                const alpha = page.getByTestId('admin-job').filter({ hasText: 'Queued Role Alpha' });
                await alpha.getByTestId('reject-job').click();
                const dialog = page.getByRole('dialog');
                await dialog.getByTestId('confirm-reject').click();
                await expect(dialog.getByTestId('reason-error')).toContainText('at least 3');
                await dialog.getByLabel(/Reason/).fill('Please add the pay range');
                await dialog.getByTestId('confirm-reject').click();
                await expect(dialog).toHaveCount(0);
                await expect(alpha).toHaveCount(0);
                const job = state.jobs.find((j) => j._id === QUEUED_A);
                expect(job?.status).toBe('rejected');
                expect(job?.moderation?.reason).toBe('Please add the pay range');
            });

            test('approves several at once after a confirmation, and says what failed', async ({ page }) => {
                // Another reviewer decided the first one a moment ago: that approval fails, the rest go through
                const state = freshState({ failOnce: { 'POST approve': { status: 409, code: 'JOB_INVALID_TRANSITION', message: 'x', meta: { status: 'rejected', to: 'approved' } } } });
                await open(page, 'moderator', '/admin/jobs', state);
                await expect(page.getByTestId('admin-job')).toHaveCount(3);
                await page.getByLabel('Select all on this page').check();
                await page.getByTestId('bulk-approve').click();
                await page.getByRole('button', { name: 'Approve all selected' }).click();
                await expect(page.getByTestId('bulk-result')).toContainText('2 of 3 approved, 1 could not be');
                expect(state.jobs.filter((j) => [PENDING_ID, QUEUED_A, QUEUED_B].includes(j._id) && j.status === 'approved')).toHaveLength(2);
            });

            test('shows reported jobs and dismisses the reports', async ({ page }) => {
                const state = freshState();
                const live = state.jobs.find((j) => j._id === LIVE_ID)!;
                live.reportCount = 3;
                await open(page, 'moderator', '/admin/jobs', state);
                await page.getByRole('tab', { name: /Reported/ }).click();
                const row = page.getByTestId('admin-job');
                await expect(row).toHaveCount(1);
                await expect(row.getByTestId('report-count')).toContainText('3 open reports');
                await row.getByTestId('dismiss-reports').click();
                await expect(row).toHaveCount(0);
                expect(live.reportCount).toBe(0);
            });

            test('verifies and rejects companies', async ({ page }) => {
                const state = await open(page, 'moderator', '/admin/jobs');
                await page.getByRole('tab', { name: /Companies/ }).click();
                const card = page.getByTestId('admin-company');
                await expect(card).toHaveCount(1);
                await expect(card).toContainText('NewCo');
                await card.getByTestId('approve-company').click();
                await expect(card).toHaveCount(0);
                expect(state.companies.find((c) => c.slug === 'newco')?.status).toBe('verified');
            });

            test('warns when the review queue is switched off', async ({ page }) => {
                await open(page, 'moderator', '/admin/jobs', freshState({ moderationEnabled: false }));
                await expect(page.getByTestId('moderation-off')).toBeVisible();
            });

            test('moves between the tabs with the arrow keys', async ({ page }) => {
                await open(page, 'admin', '/admin/jobs');
                await page.getByRole('tab', { name: /Waiting for review/ }).focus();
                await page.keyboard.press('ArrowRight');
                await expect(page.getByRole('tab', { name: /Reported/ })).toBeFocused();
                await expect(page.getByRole('tab', { name: /Reported/ })).toHaveAttribute('aria-selected', 'true');
            });
        });
    });
}
