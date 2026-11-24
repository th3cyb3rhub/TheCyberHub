import { test, expect, type Page } from '@playwright/test';
import {
    CLOSED_ID, DONE_ID, DRAFT_ID, FULL_ID, MEMBER, MINE_ID, MODERATOR, OPEN_ID, Q_FILE, Q_PICK, Q_TEXT, THEIRS_ID, VISITOR,
    freshState, iso, mockInternshipsApi, myApplication, type MockState, type Role,
} from './internships-mocks';

/** The mock API answers every call, and the server render fails soft (no backend runs here), so the browser loads each page. */
async function open(page: Page, who: Role, path: string, state: MockState = freshState()) {
    await mockInternshipsApi(page, who, state);
    await page.goto(path);
    return state;
}

const noHorizontalScroll = async (page: Page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
};

test.describe('Internships list', () => {
    test('lists open programs, filters by status and type in the address, and loads more', async ({ page }) => {
        const state = freshState({ pageCap: 2 });
        await open(page, VISITOR, '/internships', state);

        await expect(page.getByRole('heading', { name: 'Internships', level: 1 })).toBeVisible();
        await expect(page.getByTestId('cohort-card')).toHaveCount(2);
        await expect(page.getByText('Hidden Draft Program')).toHaveCount(0);

        await page.getByRole('button', { name: 'Load more' }).click();
        await expect(page.getByTestId('cohort-card')).toHaveCount(3);
        await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);

        await expect(page.getByTestId('cohort-card').filter({ hasText: 'Summer Security Internship' })).toContainText('7 of 10 spots left');
        await expect(page.getByTestId('cohort-card').filter({ hasText: 'Summer Security Internship' })).toContainText('Apply by');
        await expect(page.getByTestId('cohort-card').filter({ hasText: 'Winter Cohort' })).toContainText('No spots left');

        await page.getByRole('button', { name: 'Closed', exact: true }).click();
        await expect(page).toHaveURL(/status=closed/);
        await expect(page.getByTestId('cohort-card')).toHaveCount(1);
        await expect(page.getByTestId('cohort-card')).toContainText('Autumn Mentorship');
        await expect(page.getByTestId('cohort-card')).not.toContainText('Apply by');

        await page.getByRole('button', { name: 'Clear' }).click();
        await page.getByLabel('Type').selectOption('mentorship');
        await expect(page).toHaveURL(/type=mentorship/);
        await expect(page.getByTestId('cohort-card')).toHaveCount(1);
    });

    test('shows past programs with showcase links that open safely', async ({ page }) => {
        await open(page, VISITOR, '/internships');
        const past = page.getByTestId('past-section');
        await expect(past).toContainText('Spring 2026 Cohort');
        await expect(past.getByTestId('showcase-project')).toContainText('Subdomain Scanner');
        const code = past.getByRole('link', { name: /Code/ });
        await expect(code).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
        await expect(code).toHaveAttribute('target', '_blank');
    });

    test('shows the API error with a retry', async ({ page }) => {
        await mockInternshipsApi(page, VISITOR);
        await page.route('**/api/internships?**', (route) => route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ success: false, error: { code: 'X', message: 'Boom' } }) }));
        await page.goto('/internships');
        await expect(page.getByRole('alert').first()).toBeVisible();
        await expect(page.getByRole('button', { name: /Try again/ })).toBeVisible();
    });

    test('links a signed-in member to their applications, and staff to the admin screen', async ({ page }) => {
        await open(page, MEMBER, '/internships');
        await expect(page.getByRole('link', { name: /My applications/ })).toHaveAttribute('href', '/internships/applications');
        await expect(page.getByRole('link', { name: /Manage programs/ })).toHaveCount(0);
        const staffPage = await page.context().newPage();
        await mockInternshipsApi(staffPage, MODERATOR);
        await staffPage.goto('/internships');
        await expect(staffPage.getByRole('link', { name: /Manage programs/ })).toBeVisible();
    });
});

test.describe('Internship detail', () => {
    test('a visitor sees the program and is asked to sign in to apply', async ({ page }) => {
        await open(page, VISITOR, `/internships/${OPEN_ID}`);
        await expect(page.getByRole('heading', { name: 'Summer Security Internship', level: 1 })).toBeVisible();
        await expect(page.getByTestId('syllabus-week')).toHaveCount(1);
        await expect(page.getByRole('heading', { name: 'Mentors' })).toBeVisible();
        const link = page.getByRole('link', { name: 'Sign in to apply' });
        await expect(link).toBeVisible();
        expect(await link.getAttribute('href')).toContain('/auth?redirect=');
        await expect(page.getByTestId('your-application')).toHaveCount(0);
    });

    test('a member who can apply gets an Apply button that opens the form', async ({ page }) => {
        await open(page, MEMBER, `/internships/${OPEN_ID}`);
        await page.getByRole('link', { name: 'Apply now' }).click();
        await expect(page).toHaveURL(new RegExp(`/internships/${OPEN_ID}/apply`));
        await expect(page.getByRole('heading', { name: /Apply to Summer Security Internship/ })).toBeVisible();
    });

    test('shows the status chip, steps and a withdraw with a confirmation to a member who applied', async ({ page }) => {
        const state = freshState();
        state.applications.push(myApplication());
        await open(page, MEMBER, `/internships/${OPEN_ID}`, state);

        const panel = page.getByTestId('your-application');
        await expect(panel).toContainText('In review');
        await expect(panel.getByTestId('application-progress')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Apply now' })).toHaveCount(0);

        await panel.getByRole('button', { name: 'Withdraw' }).click();
        const dialog = page.getByRole('dialog', { name: 'Withdraw your application?' });
        await dialog.getByRole('button', { name: 'Keep my application' }).click();
        await expect(dialog).toHaveCount(0);
        expect(state.calls.some((c) => c.path.endsWith('/withdraw'))).toBe(false);

        await panel.getByRole('button', { name: 'Withdraw' }).click();
        await dialog.getByLabel(/Reason/).fill('Found another offer');
        await dialog.getByRole('button', { name: 'Withdraw', exact: true }).click();
        await expect(page.getByTestId('your-application')).toContainText('Withdrawn');
        await expect(page.getByTestId('your-application').getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
        // the button that opened the dialog is gone: focus moves to the status heading
        await expect(page.getByRole('heading', { name: 'Your application' })).toBeFocused();
        expect(state.calls.find((c) => c.path.endsWith('/withdraw'))?.body).toEqual({ reason: 'Found another offer' });
    });

    test('says applications are closed, and that the program is full, instead of offering Apply', async ({ page }) => {
        await open(page, MEMBER, `/internships/${CLOSED_ID}`);
        await expect(page.getByTestId('apply-panel')).toHaveAttribute('data-state', 'closed');
        await expect(page.getByRole('heading', { name: 'Applications closed' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Apply now' })).toHaveCount(0);

        await page.goto(`/internships/${FULL_ID}`);
        await expect(page.getByTestId('apply-panel')).toHaveAttribute('data-state', 'full');
        await expect(page.getByRole('heading', { name: 'This program is full' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Apply now' })).toHaveCount(0);
    });

    test('a draft is not available to a visitor', async ({ page }) => {
        await open(page, VISITOR, `/internships/${DRAFT_ID}`);
        await expect(page.getByRole('heading', { name: 'This program is not available' })).toBeVisible();
    });

    test('staff open a draft from the admin list, and a visitor still gets "not available"', async ({ page, browser }) => {
        await open(page, MODERATOR, '/admin/internships');
        await page.getByRole('link', { name: 'Hidden Draft Program' }).click();
        await expect(page).toHaveURL(new RegExp(`/internships/${DRAFT_ID}$`));
        await expect(page.getByRole('heading', { name: 'Hidden Draft Program', level: 1 })).toBeVisible();
        await expect(page.getByText('This program is a draft. Only staff can see it.')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'This program is not available' })).toHaveCount(0);

        const visitor = await (await browser.newContext({ bypassCSP: true })).newPage();
        await open(visitor, VISITOR, `/internships/${DRAFT_ID}`);
        await expect(visitor.getByRole('heading', { name: 'This program is not available' })).toBeVisible();
        await expect(visitor.getByRole('heading', { name: 'Hidden Draft Program', level: 1 })).toHaveCount(0);
    });

    test('a completed program shows what the cohort built', async ({ page }) => {
        await open(page, VISITOR, `/internships/${DONE_ID}`);
        await expect(page.getByRole('heading', { name: 'What this cohort built' })).toBeVisible();
        await expect(page.getByTestId('apply-panel')).toHaveCount(0);
    });
});

test.describe('Apply', () => {
    test('asks a visitor to sign in first', async ({ page }) => {
        await open(page, VISITOR, `/internships/${OPEN_ID}/apply`);
        await expect(page).toHaveURL(/\/auth\?redirect=/);
    });

    test('renders the program questions, validates them, maps server errors to fields and sends the answers', async ({ page }) => {
        const state = await open(page, MEMBER, `/internships/${OPEN_ID}/apply`);
        await expect(page.getByLabel(/^Your favourite tool/)).toBeVisible();
        await expect(page.getByLabel(/^Preferred track/)).toBeVisible();
        await expect(page.getByLabel(/^Sample report/)).toHaveAttribute('type', 'url');

        // Client checks: nothing is sent
        await page.getByRole('button', { name: 'Send application' }).click();
        await expect(page.getByText('Your favourite tool is required')).toBeVisible();
        await expect(page.getByText('Preferred track is required')).toBeVisible();
        await expect(page.getByLabel(/^Why do you want to join/)).toHaveAttribute('aria-invalid', 'true');
        expect(state.calls.some((c) => c.method === 'POST')).toBe(false);

        await page.getByLabel(/^Why do you want to join/).fill('I want to learn web security from your mentors.');
        await page.getByLabel(/^Your favourite tool/).fill('Burp Suite');
        await page.getByLabel(/^Preferred track/).selectOption('Offensive');
        await page.getByLabel('GitHub profile').fill('javascript:alert(1)');
        await page.getByRole('button', { name: 'Send application' }).click();
        await expect(page.getByText(/GitHub link must be a public link/)).toBeVisible();
        await page.getByLabel('GitHub profile').fill('https://github.com/testuser');

        // A server refusal names a question: it shows on that question
        state.failOnce['POST apply'] = { status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ field: `answers.${Q_FILE}`, message: 'Sample report must be a valid http or https link' }] };
        await page.getByRole('button', { name: 'Send application' }).click();
        await expect(page.getByText('Sample report must be a valid http or https link')).toBeVisible();
        await expect(page.getByLabel(/^Sample report/)).toHaveAttribute('aria-invalid', 'true');
        await expect(page.getByTestId('apply-error')).toContainText('Some answers need your attention');

        await page.getByLabel(/^Sample report/).fill('https://example.org/report.pdf');
        await page.getByRole('button', { name: 'Send application' }).click();
        await expect(page.getByTestId('apply-success')).toContainText('Application sent');
        const sent = state.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/apply')).at(-1)?.body as { coverLetter: string; githubUrl: string; answers: { field: string; value: string }[] };
        expect(sent.githubUrl).toBe('https://github.com/testuser');
        expect(sent.answers).toEqual([
            { field: Q_TEXT, value: 'Burp Suite' },
            { field: Q_PICK, value: 'Offensive' },
            { field: Q_FILE, value: 'https://example.org/report.pdf' },
        ]);
        await page.getByRole('link', { name: 'Back to the program' }).click();
        await expect(page.getByTestId('your-application')).toContainText('Pending');
    });

    test.describe('answers from the server', () => {
        for (const [code, text] of [['INTERNSHIP_CLOSED', /closed/i], ['INTERNSHIP_ALREADY_APPLIED', /already applied/i], ['INTERNSHIP_FULL', /no seats left/i]] as const) {
            test(`explains a 409 ${code}`, async ({ page }) => {
                const state = await open(page, MEMBER, `/internships/${OPEN_ID}/apply`);
                state.failOnce['POST apply'] = { status: 409, code, message: 'server words' };
                await page.getByLabel(/^Why do you want to join/).fill('I want to learn web security from your mentors.');
                await page.getByLabel(/^Your favourite tool/).fill('Burp');
                await page.getByLabel(/^Preferred track/).selectOption('Defensive');
                await page.getByRole('button', { name: 'Send application' }).click();
                await expect(page.getByTestId('apply-error')).toContainText(text);
                await expect(page.getByTestId('apply-error')).not.toContainText('server words');
            });
        }

        test('shows an answer to a question that no longer exists in the banner and reloads the program', async ({ page }) => {
            const state = await open(page, MEMBER, `/internships/${OPEN_ID}/apply`);
            state.failOnce['POST apply'] = { status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ field: `answers.${'9'.repeat(24)}`, message: 'Pick a track is required' }] };
            await page.getByLabel(/^Why do you want to join/).fill('I want to learn web security from your mentors.');
            await page.getByLabel(/^Your favourite tool/).fill('Burp');
            await page.getByLabel(/^Preferred track/).selectOption('Defensive');
            const reads = () => state.calls.filter((c) => c.method === 'GET' && c.path === `/${OPEN_ID}`).length;
            await expect.poll(reads).toBeGreaterThanOrEqual(1);
            const before = reads();
            await page.getByRole('button', { name: 'Send application' }).click();
            await expect(page.getByTestId('apply-error-lines')).toContainText('Pick a track is required');
            await expect.poll(reads).toBeGreaterThan(before);
            await expect(page.getByLabel(/^Your favourite tool/)).toHaveValue('Burp');
        });

        test('says "try again in a moment" on a rate limit and keeps the typed answers', async ({ page }) => {
            const state = await open(page, MEMBER, `/internships/${OPEN_ID}/apply`);
            state.failOnce['POST apply'] = { status: 429, code: 'RATE_LIMITED', message: 'slow down' };
            await page.getByLabel(/^Why do you want to join/).fill('I want to learn web security from your mentors.');
            await page.getByLabel(/^Your favourite tool/).fill('Burp');
            await page.getByLabel(/^Preferred track/).selectOption('Defensive');
            await page.getByRole('button', { name: 'Send application' }).click();
            await expect(page.getByTestId('apply-error')).toContainText('Too many requests. Try again in a moment.');
            await expect(page.getByLabel(/^Your favourite tool/)).toHaveValue('Burp');
        });
    });

    test('does not show a form for a member who applied, or when it is closed', async ({ page }) => {
        const state = freshState();
        state.applications.push(myApplication());
        await open(page, MEMBER, `/internships/${OPEN_ID}/apply`, state);
        await expect(page.getByRole('heading', { name: 'You have already applied' })).toBeVisible();
        await page.goto(`/internships/${CLOSED_ID}/apply`);
        await expect(page.getByRole('heading', { name: 'Applications are closed' })).toBeVisible();
    });
});

test.describe('My applications', () => {
    test('shows the status timeline with the reviewer note, and withdraws after a confirmation', async ({ page }) => {
        const state = freshState();
        state.applications.push(myApplication());
        await open(page, MEMBER, '/internships/applications', state);

        const card = page.getByTestId('my-application');
        await expect(card).toContainText('Summer Security Internship');
        await expect(card.getByTestId('review-note')).toContainText('Reading your repo now');
        const items = card.getByTestId('status-timeline').getByRole('listitem');
        await expect(items).toHaveCount(2);
        await expect(items.first()).toContainText('Pending');
        await expect(items.last()).toHaveAttribute('aria-current', 'step');

        await card.getByRole('button', { name: 'Withdraw', exact: true }).click();
        await page.getByLabel(/Reason/).fill('Changed my plans');
        await page.getByRole('dialog').getByRole('button', { name: 'Withdraw', exact: true }).click();
        await expect(card).toHaveAttribute('data-status', 'withdrawn');
        await expect(card.getByTestId('status-timeline').getByRole('listitem')).toHaveCount(3);
        await expect(card.getByTestId('timeline-note').filter({ hasText: 'Your reason' })).toHaveCount(1);
        await expect(card.getByRole('button', { name: 'Withdraw', exact: true })).toHaveCount(0);
        await expect(card.getByRole('heading', { level: 2 })).toBeFocused();
    });

    test('explains a withdraw that the API refuses, and shows the empty state', async ({ page }) => {
        const state = freshState();
        state.applications.push(myApplication({ status: 'pending' }));
        await open(page, MEMBER, '/internships/applications', state);
        state.failOnce['PUT withdraw'] = { status: 409, code: 'INTERNSHIP_INVALID_TRANSITION', message: 'no', meta: { from: 'rejected', to: 'withdrawn', allowed: [] } };
        await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Withdraw', exact: true }).click();
        await expect(page.getByText(/already rejected/)).toBeVisible();

        const empty = await page.context().newPage();
        await mockInternshipsApi(empty, MEMBER);
        await empty.goto('/internships/applications');
        await expect(empty.getByText('You have not applied yet')).toBeVisible();
    });

    test('asks a visitor to sign in', async ({ page }) => {
        await open(page, VISITOR, '/internships/applications');
        await expect(page).toHaveURL(/\/auth\?redirect=/);
    });
});

test.describe('Staff: programs', () => {
    test('a member cannot open the admin screens', async ({ page }) => {
        await open(page, MEMBER, '/admin/internships');
        await expect(page.getByRole('heading', { name: 'You cannot open this page' })).toBeVisible();
    });

    test('lists every program with status, counts and actions, and closes one after a confirmation', async ({ page }) => {
        const state = await open(page, MODERATOR, '/admin/internships');
        await expect(page.getByTestId('admin-cohort')).toHaveCount(5);
        const open_ = page.getByTestId('admin-cohort').filter({ hasText: 'Summer Security Internship' });
        await expect(open_.getByTestId('admin-counts')).toContainText('3 / 10 accepted');
        await expect(open_.getByTestId('admin-counts')).toContainText('5 applications');
        await expect(page.getByTestId('admin-cohort').filter({ hasText: 'Hidden Draft Program' })).toHaveAttribute('data-status', 'draft');
        await expect(open_.getByRole('link', { name: /Edit/ })).toHaveAttribute('href', `/admin/internships/${OPEN_ID}/edit`);

        await page.getByRole('button', { name: 'Draft', exact: true }).click();
        await expect(page.getByTestId('admin-cohort')).toHaveCount(1);
        await page.getByRole('button', { name: 'All', exact: true }).click();

        await open_.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(page.getByRole('dialog')).toContainText('Close applications for Summer Security Internship?');
        await page.getByRole('button', { name: 'Close applications' }).click();
        await expect.poll(() => state.calls.find((c) => c.method === 'PUT' && c.path === `/${OPEN_ID}`)?.body).toEqual({ status: 'closed' });
        await expect(page.getByTestId('admin-cohort').filter({ hasText: 'Summer Security Internship' })).toHaveAttribute('data-status', 'closed');
    });

    test('creates a program: dates are checked first, then the payload is sent', async ({ page }) => {
        const state = await open(page, MODERATOR, '/admin/internships/create');
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.getByTestId('form-error')).toBeVisible();
        await expect(page.getByLabel(/^Title/)).toHaveAttribute('aria-invalid', 'true');

        await page.getByLabel(/^Title/).fill('Winter Internship');
        await page.getByLabel(/^Description/).fill('A program for newcomers.');
        await page.getByLabel(/^Application deadline/).fill('2099-01-11T10:00');
        await page.getByLabel(/^Start/).fill('2099-01-10T10:00');
        await page.getByLabel(/^End/).fill('2099-03-10T10:00');
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.getByText(/deadline must be on or before the start date/)).toBeVisible();
        expect(state.calls.some((c) => c.method === 'POST')).toBe(false);
        await page.getByLabel(/^Application deadline/).fill('2099-01-05T10:00');

        await page.getByLabel(/^Requirements/).fill('Networking basics\nCuriosity');
        await page.getByRole('button', { name: 'Add a question' }).click();
        await page.getByTestId('custom-field-row').getByLabel(/^Question/).fill('Preferred track');
        await page.getByTestId('custom-field-row').getByLabel('Answer type').selectOption('dropdown');
        await page.getByTestId('custom-field-row').getByLabel('Option 1', { exact: true }).fill('Offensive');
        await page.getByRole('button', { name: 'Add a week' }).click();
        await page.getByTestId('syllabus-row').getByLabel(/^Title/).fill('Foundations');
        await page.getByRole('button', { name: 'Save draft' }).click();

        await expect(page).toHaveURL(/\/admin\/internships$/);
        const sent = state.calls.find((c) => c.method === 'POST' && c.path === '/')?.body as Record<string, unknown>;
        expect(sent).toMatchObject({ title: 'Winter Internship', status: 'draft', capacity: 0, requirements: ['Networking basics', 'Curiosity'] });
        expect(sent.customFields).toEqual([{ label: 'Preferred track', type: 'dropdown', options: ['Offensive'], required: false }]);
        expect(sent.syllabus).toEqual([{ week: 1, title: 'Foundations', description: '', topics: [], deliverables: [] }]);
        await expect(page.getByTestId('admin-cohort').filter({ hasText: 'Winter Internship' })).toBeVisible();
    });

    test('asks before a form with typed changes is left, and not when it is clean', async ({ page }) => {
        await open(page, MODERATOR, '/admin/internships/create');
        await page.getByRole('link', { name: 'Cancel' }).click();
        await expect(page).toHaveURL(/\/admin\/internships$/);

        await page.goto('/admin/internships/create');
        await page.getByLabel(/^Title/).fill('Half written');
        await page.getByRole('link', { name: 'Cancel' }).click();
        const dialog = page.getByRole('dialog', { name: 'Leave without saving?' });
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: 'Keep editing' }).click();
        await expect(page).toHaveURL(/\/admin\/internships\/create$/);
        await expect(page.getByLabel(/^Title/)).toHaveValue('Half written');

        await page.getByRole('link', { name: 'Cancel' }).click();
        await dialog.getByRole('button', { name: 'Leave' }).click();
        await expect(page).toHaveURL(/\/admin\/internships$/);
    });

    test('edits a program and sends only what changed, with the id of each existing question', async ({ page }) => {
        const state = await open(page, MODERATOR, `/admin/internships/${OPEN_ID}/edit`);
        await expect(page.getByLabel(/^Title/).first()).toHaveValue('Summer Security Internship');
        await expect(page.getByTestId('custom-field-row')).toHaveCount(3);

        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByText('Nothing changed, so there is nothing to save.')).toBeVisible();
        expect(state.calls.some((c) => c.method === 'PUT')).toBe(false);

        await page.getByLabel(/^Title/).first().fill('Summer Security Internship 2027');
        await page.getByRole('button', { name: 'Move question 3 up' }).click();
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page).toHaveURL(/\/admin\/internships$/);
        const sent = state.calls.find((c) => c.method === 'PUT' && c.path === `/${OPEN_ID}`)?.body as { title: string; customFields: { _id: string }[] };
        expect(Object.keys(sent).sort()).toEqual(['customFields', 'title']);
        expect(sent.customFields.map((f) => f._id)).toEqual([Q_TEXT, Q_FILE, Q_PICK]);
    });

    test('shows the capacity conflict from the API on the capacity field', async ({ page }) => {
        const state = await open(page, MODERATOR, `/admin/internships/${OPEN_ID}/edit`);
        state.failOnce['PUT '] = { status: 409, code: 'INTERNSHIP_CAPACITY_TOO_LOW', message: 'too low' };
        await page.getByLabel(/^Capacity/).fill('6');
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByLabel(/^Capacity/)).toHaveAttribute('aria-invalid', 'true');
        await expect(page.getByText(/cannot be lower than the number of applicants already accepted/).first()).toBeVisible();
    });
});

test.describe('Staff: applications', () => {
    const withTwo = () => {
        const state = freshState();
        state.applications.push(
            { ...myApplication({ _id: '4'.repeat(24), status: 'pending', statusHistory: [{ status: 'pending', at: iso(-1), actor: 'applicant' }], appliedAt: iso(-1) }), user: { _id: MODERATOR.id, name: 'Staff Member', username: 'staff', email: 'staff@example.org' } },
        );
        return state;
    };

    test('lists the applications of a program by status, with the email visible to staff only here', async ({ page }) => {
        await open(page, MODERATOR, `/admin/internships/${OPEN_ID}/applications`, withTwo());
        await expect(page.getByTestId('application-row')).toHaveCount(2);
        await expect(page.getByTestId('application-row').first()).toContainText('grace@example.org');
        await page.getByRole('button', { name: 'Pending', exact: true }).click();
        await expect(page.getByTestId('application-row')).toHaveCount(2);
        await page.getByRole('button', { name: 'Accepted', exact: true }).click();
        await expect(page.getByText('No applications with this status')).toBeVisible();
    });

    test('reviews with only the allowed moves, a note and a confirmation; a decision is final', async ({ page }) => {
        const state = await open(page, MODERATOR, `/admin/internships/${OPEN_ID}/applications`, withTwo());
        await page.getByRole('button', { name: 'Review application from Grace Hopper' }).click();
        const drawer = page.getByTestId('application-drawer');
        await expect(drawer).toContainText('grace@example.org');
        // an answer that holds markup is text
        await expect(drawer).toContainText('<img src=x onerror=alert(1)>');
        expect(await drawer.locator('img').count()).toBe(0);
        await expect(drawer.getByTestId('status-timeline')).toBeVisible();

        const buttons = drawer.getByTestId('review-panel').getByRole('button');
        await expect(buttons).toHaveText(['Start review', 'Accept', 'Reject']);

        await drawer.getByRole('button', { name: 'Start review' }).click();
        await expect(drawer.getByTestId('review-confirm')).toBeVisible();
        expect(state.calls.some((c) => c.path.endsWith('/status'))).toBe(false);
        await drawer.getByTestId('review-confirm-button').click();
        await expect(drawer.getByTestId('review-panel').getByRole('button')).toHaveText(['Accept', 'Reject']);

        await drawer.getByRole('button', { name: 'Accept' }).click();
        await drawer.getByLabel(/Note to the applicant/).fill('Welcome aboard');
        await drawer.getByTestId('review-confirm-button').click();
        await expect(drawer.getByTestId('review-final')).toBeVisible();
        expect(state.calls.filter((c) => c.path.endsWith('/status')).map((c) => c.body)).toEqual([{ status: 'reviewing' }, { status: 'accepted', note: 'Welcome aboard' }]);
        await expect(drawer.getByTestId('status-timeline').getByRole('listitem')).toHaveCount(3);
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('application-row').first()).toHaveAttribute('data-status', 'accepted');
    });

    test('shows your own application with the moves off and the reason', async ({ page }) => {
        await open(page, MODERATOR, `/admin/internships/${OPEN_ID}/applications`, withTwo());
        await page.getByRole('button', { name: 'Review application from Staff Member' }).click();
        const drawer = page.getByTestId('application-drawer');
        await expect(drawer.getByTestId('self-review')).toContainText('This is your own application');
        for (const name of ['Start review', 'Accept', 'Reject']) await expect(drawer.getByRole('button', { name })).toBeDisabled();
    });

    test('explains a move that is no longer allowed and a cohort that is full', async ({ page }) => {
        const state = await open(page, MODERATOR, `/admin/internships/${OPEN_ID}/applications`, withTwo());
        await page.getByRole('button', { name: 'Review application from Grace Hopper' }).click();
        const drawer = page.getByTestId('application-drawer');

        // Somebody else decides first
        state.applications.find((a) => a._id === THEIRS_ID)!.status = 'accepted';
        await drawer.getByRole('button', { name: 'Reject' }).click();
        await drawer.getByTestId('review-confirm-button').click();
        await expect(drawer.getByTestId('review-error')).toContainText('already accepted');
        await expect(drawer.getByTestId('review-final')).toBeVisible();
    });

    test('shows a full cohort error from the API on accept', async ({ page }) => {
        const state = await open(page, MODERATOR, `/admin/internships/${OPEN_ID}/applications`, withTwo());
        state.failOnce['PUT status'] = { status: 409, code: 'INTERNSHIP_FULL', message: 'x' };
        await page.getByRole('button', { name: 'Review application from Grace Hopper' }).click();
        const drawer = page.getByTestId('application-drawer');
        await drawer.getByRole('button', { name: 'Accept' }).click();
        await drawer.getByTestId('review-confirm-button').click();
        await expect(drawer.getByTestId('review-error')).toContainText('no seats left');
        await expect(drawer.getByRole('button', { name: 'Accept' })).toBeVisible();
    });

    test('follows the real seats after a 409 INTERNSHIP_FULL: Accept turns off once the cohort is reloaded', async ({ page }) => {
        const state = await open(page, MODERATOR, `/admin/internships/${OPEN_ID}/applications`, withTwo());
        await page.getByRole('button', { name: 'Review application from Grace Hopper' }).click();
        const drawer = page.getByTestId('application-drawer');
        await expect(drawer.getByRole('button', { name: 'Accept' })).toBeEnabled();
        // another reviewer takes the last seats while this drawer is open
        state.cohorts.find((c) => c._id === OPEN_ID)!.acceptedCount = 10;
        await drawer.getByRole('button', { name: 'Accept' }).click();
        await drawer.getByTestId('review-confirm-button').click();
        await expect(drawer.getByTestId('review-error')).toContainText('no seats left');
        await expect(drawer.getByRole('button', { name: 'Accept' })).toBeDisabled();
    });

    test('turns acceptance off in a cohort that is already full', async ({ page }) => {
        const state = freshState();
        state.applications.push({ ...myApplication({ _id: '8'.repeat(24), cohort: FULL_ID, status: 'pending' }), user: { _id: 'someone', name: 'Pat Doe', username: 'pat', email: 'pat@example.org' } });
        await open(page, MODERATOR, `/admin/internships/${FULL_ID}/applications`, state);
        await page.getByRole('button', { name: 'Review application from Pat Doe' }).click();
        const drawer = page.getByTestId('application-drawer');
        await expect(drawer.getByRole('button', { name: 'Accept' })).toBeDisabled();
        await expect(drawer.getByText(/Every seat is taken/)).toBeVisible();
        await expect(drawer.getByRole('button', { name: 'Reject' })).toBeEnabled();
    });
});

test.describe('Phone layout (390px)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    const pages: [string, Role, string][] = [
        ['the list', VISITOR, '/internships'],
        ['the detail page', MEMBER, `/internships/${OPEN_ID}`],
        ['the apply form', MEMBER, `/internships/${OPEN_ID}/apply`],
        ['my applications', MEMBER, '/internships/applications'],
        ['the admin list', MODERATOR, '/admin/internships'],
        ['the admin form', MODERATOR, `/admin/internships/${OPEN_ID}/edit`],
        ['the applications table', MODERATOR, `/admin/internships/${OPEN_ID}/applications`],
    ];

    for (const [name, who, path] of pages) {
        test(`${name} does not scroll sideways`, async ({ page }) => {
            const state = freshState();
            state.applications.push(myApplication());
            await open(page, who, path, state);
            await expect(page.getByRole('heading').first()).toBeVisible();
            await page.waitForLoadState('networkidle');
            await noHorizontalScroll(page);
        });
    }

    test('the review drawer fits the screen', async ({ page }) => {
        await open(page, MODERATOR, `/admin/internships/${OPEN_ID}/applications`);
        await page.getByRole('button', { name: 'Review application from Grace Hopper' }).click();
        await expect(page.getByTestId('application-drawer')).toBeVisible();
        await noHorizontalScroll(page);
        const box = await page.getByTestId('application-drawer').boundingBox();
        expect(box?.width ?? 0).toBeLessThanOrEqual(390);
    });
});
