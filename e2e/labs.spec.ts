import { test, expect, type Page } from '@playwright/test';
import {
    ADMIN, DRAFT, MEMBER, MODERATOR, NO_FLAG, PAYLOAD, SQL, VISITOR,
    freshState, mockLabsApi, started, type MockState, type Role,
} from './labs-mocks';

/** The mock API answers every call, and the server render fails soft (no backend runs here), so the browser loads each page. */
async function open(page: Page, who: Role, path: string, state: MockState = freshState()) {
    await mockLabsApi(page, who, state);
    await page.goto(path);
    return state;
}

const noHorizontalScroll = async (page: Page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
};

const submits = (state: MockState) => state.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/submit'));

async function sendFlag(page: Page, flag: string) {
    await page.getByLabel('Flag', { exact: true }).fill(flag);
    await page.getByRole('button', { name: 'Submit flag' }).click();
}

test.describe('Labs list', () => {
    test('lists published labs, filters in the address, searches and loads more', async ({ page }) => {
        const state = freshState({ pageCap: 4 });
        await open(page, VISITOR, '/labs', state);

        await expect(page.getByRole('heading', { name: 'Labs', level: 1 })).toBeVisible();
        await expect(page.getByTestId('lab-card')).toHaveCount(4);
        await expect(page.getByText('Secret Draft Lab')).toHaveCount(0);
        await expect(page.getByTestId('lab-count')).toContainText('Showing 4 of 9 labs');

        await page.getByRole('button', { name: 'Load more' }).click();
        await expect(page.getByTestId('lab-card')).toHaveCount(8);
        await page.getByRole('button', { name: 'Load more' }).click();
        await expect(page.getByTestId('lab-card')).toHaveCount(9);
        await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
        // The total is counted on page 1 only: later pages never overwrite it
        await expect(page.getByTestId('lab-count')).toContainText('9 labs');

        // A visitor has no progress chips
        await expect(page.getByRole('group', { name: 'My progress' })).toHaveCount(0);

        await page.getByRole('button', { name: /^Hard/ }).click();
        await expect(page).toHaveURL(/difficulty=hard/);
        await expect(page.getByTestId('lab-card')).toHaveCount(2);

        await page.getByRole('button', { name: 'Clear filters' }).click();
        await expect(page).not.toHaveURL(/difficulty=/);
        await page.getByLabel('Category').selectOption('cryptography');
        await expect(page).toHaveURL(/category=cryptography/);
        await expect(page.getByTestId('lab-card')).toHaveCount(2);

        await page.getByLabel('Search labs').fill('caesar');
        await expect(page).toHaveURL(/q=caesar/);
        await expect(page.getByTestId('lab-card')).toHaveCount(1);
        await expect(page.getByTestId('lab-card')).toContainText('Caesar Warmup');

        await page.getByLabel('Search labs').fill('zzzz');
        await expect(page.getByRole('heading', { name: 'No labs match these filters' })).toBeVisible();
        await page.getByRole('button', { name: 'Clear filters' }).last().click();
        await expect(page.getByTestId('lab-card').first()).toBeVisible();
        await expect(page.getByLabel('Search labs')).toHaveValue('');
    });

    test('a filter in the address is applied when the page opens', async ({ page }) => {
        await open(page, VISITOR, '/labs?difficulty=easy&category=osint');
        await expect(page.getByTestId('lab-card')).toHaveCount(1);
        await expect(page.getByTestId('lab-card')).toContainText('OSINT Trail');
        await expect(page.getByRole('button', { name: /^Easy/ })).toHaveAttribute('aria-pressed', 'true');
    });

    test('a short search waits for two characters', async ({ page }) => {
        const state = await open(page, VISITOR, '/labs');
        await expect(page.getByTestId('lab-card').first()).toBeVisible();
        await page.getByLabel('Search labs').fill('x');
        await expect(page.getByText('Type at least 2 characters to search.')).toBeVisible();
        // Once a valid search has gone through the same debounce, the one-letter text had its chance to be sent
        await page.getByLabel('Search labs').fill('sq');
        await expect.poll(() => state.calls.some((c) => /(^|&)q=sq(&|$)/.test(c.query ?? ''))).toBe(true);
        expect(state.calls.some((c) => /(^|&)q=x(&|$)/.test(c.query ?? ''))).toBe(false);
    });

    test('a member sees progress badges and can filter by their own progress', async ({ page }) => {
        const state = freshState();
        state.progress[SQL] = started();
        await open(page, MEMBER, '/labs', state);
        await expect(page.getByTestId('lab-card').filter({ hasText: 'SQL Injection Basics' })).toHaveAttribute('data-my-status', 'in-progress');
        await expect(page.getByTestId('lab-card').filter({ hasText: 'SQL Injection Basics' })).toContainText('In progress');
        await page.getByRole('button', { name: 'In progress' }).click();
        await expect(page).toHaveURL(/status=in-progress/);
        await expect(page.getByTestId('lab-card')).toHaveCount(1);
        await expect(page.getByTestId('labs-stats')).toBeVisible();
    });

    test('shows the API error with a retry', async ({ page }) => {
        await mockLabsApi(page, VISITOR);
        await page.route('**/api/labs?**', (route) => route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ success: false, error: { code: 'X', message: 'Boom' } }) }));
        await page.goto('/labs?difficulty=easy');
        await expect(page.getByRole('alert').first()).toBeVisible();
        await expect(page.getByRole('button', { name: /Try again/ })).toBeVisible();
    });

    test('only admins and owners get the manage link', async ({ page, browser }) => {
        await open(page, MODERATOR, '/labs');
        await expect(page.getByTestId('lab-card').first()).toBeVisible();
        await expect(page.getByRole('link', { name: /Manage labs/ })).toHaveCount(0);
        const admin = await browser.newPage();
        await mockLabsApi(admin, ADMIN);
        await admin.goto('/labs');
        await expect(admin.getByRole('link', { name: /Manage labs/ })).toHaveAttribute('href', '/admin/labs');
        await admin.close();
    });
});

test.describe('Lab workspace', () => {
    test('a visitor reads the lab and is asked to sign in, and no hint text leaks', async ({ page }) => {
        await open(page, VISITOR, `/labs/${SQL}`);
        await expect(page.getByRole('heading', { name: 'SQL Injection Basics', level: 1 })).toBeVisible();
        await expect(page.getByTestId('signin-prompt')).toBeVisible();
        const signIn = page.getByTestId('signin-prompt').getByRole('link', { name: /Sign in/ });
        expect(await signIn.getAttribute('href')).toContain('/auth?redirect=');
        await expect(page.getByTestId('flag-form')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Open hint 1' })).toBeDisabled();
        await expect(page.getByText('Look at the login form.')).toHaveCount(0);
    });

    test('a lab that does not exist says so', async ({ page }) => {
        await open(page, VISITOR, '/labs/no-such-lab');
        await expect(page.getByRole('heading', { name: 'SQL Injection Basics' })).toHaveCount(0);
        await expect(page.getByText(/not available|not found/i).first()).toBeVisible();
    });

    test('a member starts, opens a hint after confirming the cost, and the points drop', async ({ page }) => {
        const state = await open(page, MEMBER, `/labs/${SQL}`);
        await expect(page.getByTestId('progress-panel')).toHaveAttribute('data-status', 'not-started');
        await expect(page.getByTestId('flag-form')).toHaveCount(0);

        await page.getByRole('button', { name: 'Start lab' }).click();
        await expect(page.getByTestId('progress-panel')).toHaveAttribute('data-status', 'in-progress');
        await expect(page.getByTestId('points-now')).toHaveText('50 of 50');
        await expect(page.getByTestId('flag-form')).toBeVisible();
        expect(state.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/start'))).toHaveLength(1);

        await page.getByRole('button', { name: 'Open hint 1' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText('Open hint 1?');
        await expect(dialog).toContainText('you would earn 40 instead of 50');
        await dialog.getByRole('button', { name: 'Keep it closed' }).click();
        await expect(dialog).toHaveCount(0);
        expect(state.calls.some((c) => c.path.endsWith('/hint'))).toBe(false);

        await page.getByRole('button', { name: 'Open hint 1' }).click();
        await page.getByRole('dialog').getByRole('button', { name: /^Open for 10 points?$/ }).click();
        await expect(page.getByTestId('lab-hint').first()).toHaveAttribute('data-opened', 'true');
        await expect(page.getByTestId('lab-hint').first()).toContainText('Look at the');
        await expect(page.getByTestId('points-now')).toHaveText('40 of 50');
        expect(state.calls.filter((c) => c.path.endsWith('/hint'))[0].body).toEqual({ hintIndex: 0 });
        // Once a hint is open, the start can no longer be taken back
        await expect(page.getByRole('button', { name: 'Reset my start' })).toHaveCount(0);
    });

    test('a start with no hint and no flag can be reset', async ({ page }) => {
        const state = freshState();
        state.progress[SQL] = started();
        await open(page, MEMBER, `/labs/${SQL}`, state);
        await page.getByRole('button', { name: 'Reset my start' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Reset my start' }).click();
        await expect(page.getByTestId('progress-panel')).toHaveAttribute('data-status', 'not-started');
        await expect(page.getByRole('button', { name: 'Start lab' })).toBeVisible();
    });

    test('a wrong flag says how many attempts are left, clears the input and keeps the flag out of storage', async ({ page }) => {
        const state = freshState();
        state.progress[SQL] = started();
        await open(page, MEMBER, `/labs/${SQL}`, state);
        const input = page.getByLabel('Flag', { exact: true });

        await sendFlag(page, 'flag{nope}');
        await expect(page.getByTestId('wrong-notice')).toContainText('That is not the flag');
        await expect(page.getByTestId('wrong-notice')).toContainText('1 attempt so far');
        await expect(page.getByTestId('wrong-notice')).toContainText('4 left');
        await expect(input).toHaveValue('');
        await expect(input).toBeFocused();
        await expect(page.getByTestId('flag-status')).toHaveAttribute('aria-live', 'polite');

        const kept = await page.evaluate(() => JSON.stringify({ ...window.localStorage, ...window.sessionStorage }));
        expect(kept).not.toContain('nope');
        expect(submits(state)).toHaveLength(1);
        expect(submits(state)[0].body).toEqual({ flag: 'flag{nope}' });
    });

    test('an empty flag is not sent', async ({ page }) => {
        const state = freshState();
        state.progress[SQL] = started();
        await open(page, MEMBER, `/labs/${SQL}`, state);
        await page.getByRole('button', { name: 'Submit flag' }).click();
        await expect(page.getByLabel('Flag', { exact: true })).toHaveAttribute('aria-invalid', 'true');
        expect(submits(state)).toHaveLength(0);
    });

    test('a double submit sends one request', async ({ page }) => {
        const state = freshState();
        state.progress[SQL] = started();
        await open(page, MEMBER, `/labs/${SQL}`, state);
        await page.getByLabel('Flag', { exact: true }).fill('flag{nope}');
        // Two submits in the same tick, before the screen has re-rendered
        await page.getByTestId('flag-form').locator('form').evaluate((form) => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
        await expect(page.getByTestId('wrong-notice')).toBeVisible();
        expect(submits(state)).toHaveLength(1);
    });

    test('five wrong flags lock the form with a countdown, which then opens again', async ({ page }) => {
        const state = freshState({ lockSeconds: 4 });
        state.progress[SQL] = started();
        await open(page, MEMBER, `/labs/${SQL}`, state);

        for (let i = 0; i < 5; i += 1) {
            await expect(page.getByRole('button', { name: 'Submit flag' })).toBeEnabled();
            await sendFlag(page, `flag{wrong${i}}`);
            await expect(page.getByTestId('wrong-notice').or(page.getByTestId('lock-notice')).first()).toBeVisible();
            if (i < 4) await expect(page.getByTestId('wrong-notice')).toContainText(`${i + 1} ${i === 0 ? 'attempt' : 'attempts'} so far`);
        }
        await expect(page.getByTestId('flag-form')).toHaveAttribute('data-phase', 'locked');
        await expect(page.getByTestId('lock-notice')).toContainText('Locked after too many wrong flags');
        await expect(page.getByTestId('lock-clock')).toHaveText(/^0:0[1-4]$/);
        await expect(page.getByLabel('Flag', { exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Submit flag' })).toBeDisabled();
        await expect(page.getByRole('timer')).toBeVisible();

        // Hints stay open while the form is locked
        await expect(page.getByRole('button', { name: 'Open hint 1' })).toBeEnabled();

        // The lock ends by itself
        await expect(page.getByTestId('flag-form')).toHaveAttribute('data-phase', 'idle', { timeout: 10_000 });
        await expect(page.getByLabel('Flag', { exact: true })).toBeEnabled();

        // The right flag now works
        await sendFlag(page, 'flag{sql_basics}');
        await expect(page.getByTestId('completed-panel')).toBeVisible();
    });

    test('a locked lab stays locked after a reload', async ({ page }) => {
        const state = freshState({ lockSeconds: 600 });
        state.progress[SQL] = started({ lockedUntil: Date.now() + 600_000, attempts: 5 });
        await open(page, MEMBER, `/labs/${SQL}`, state);
        await expect(page.getByTestId('flag-form')).toHaveAttribute('data-phase', 'locked');
        await expect(page.getByLabel('Flag', { exact: true })).toBeDisabled();
        await expect(page.getByTestId('lock-clock')).toHaveText(/^(9:5\d|10:00)$/);
    });

    test('a locked answer from the server shows the lock even when the screen did not know', async ({ page }) => {
        const state = freshState();
        state.progress[SQL] = started();
        state.failOnce['POST /submit'] = { status: 429, code: 'LAB_LOCKED', message: 'Too many wrong flags for this lab.', meta: { retryAfter: 120, lockedUntil: new Date(Date.now() + 120_000).toISOString() } };
        await open(page, MEMBER, `/labs/${SQL}`, state);
        await sendFlag(page, 'flag{sql_basics}');
        await expect(page.getByTestId('lock-notice')).toBeVisible();
        await expect(page.getByTestId('lock-clock')).toHaveText(/^[12]:\d\d$/);
        await expect(page.getByLabel('Flag', { exact: true })).toBeDisabled();
    });

    test('a lock counts its seconds from when the answer arrived, even when the API clock is 20 minutes ahead', async ({ page }) => {
        const state = freshState({ lockSeconds: 600, clockSkewMs: 20 * 60_000 });
        state.progress[SQL] = started({ lockedUntil: Date.now() + 600_000, attempts: 5 });
        await open(page, MEMBER, `/labs/${SQL}`, state);
        await expect(page.getByTestId('flag-form')).toHaveAttribute('data-phase', 'locked');
        // The instant says 30 minutes, the seconds say 10: the seconds win
        await expect(page.getByTestId('lock-clock')).toHaveText(/^(9:5\d|10:00)$/);
    });

    test('a lock still counts correctly when the API clock is 5 minutes behind, also after a reload', async ({ page }) => {
        const state = freshState({ lockSeconds: 600, clockSkewMs: -5 * 60_000 });
        state.progress[SQL] = started({ lockedUntil: Date.now() + 600_000, attempts: 5 });
        await open(page, MEMBER, `/labs/${SQL}`, state);
        await expect(page.getByTestId('lock-clock')).toHaveText(/^(9:5\d|10:00)$/);
        await page.reload();
        await expect(page.getByTestId('flag-form')).toHaveAttribute('data-phase', 'locked');
        await expect(page.getByTestId('lock-clock')).toHaveText(/^(9:5\d|10:00)$/);
    });

    test('a busy answer asks to try again, and the form stays usable', async ({ page }) => {
        const state = freshState();
        state.progress[SQL] = started();
        state.failOnce['POST /submit'] = { status: 409, code: 'LAB_BUSY', message: 'Another answer is being checked.' };
        await open(page, MEMBER, `/labs/${SQL}`, state);
        await sendFlag(page, 'flag{x}');
        await expect(page.getByTestId('flag-status')).toContainText(/send it again/i);
        await expect(page.getByLabel('Flag', { exact: true })).toBeEnabled();
    });

    test('the right flag completes the lab: points, a badge, the next lab, and the flag form goes away', async ({ page }) => {
        const state = freshState();
        state.progress[SQL] = started({ hintsUsed: [0] });
        await open(page, MEMBER, `/labs/${SQL}`, state);
        await sendFlag(page, 'FLAG{SQL_BASICS}');

        await expect(page.getByTestId('completed-panel')).toBeVisible();
        await expect(page.getByTestId('points-earned')).toContainText('40');
        await expect(page.getByTestId('new-badges')).toContainText('First Lab');
        await expect(page.getByTestId('next-lab').getByRole('link', { name: /Next lab/ })).toHaveAttribute('href', /\/labs\/[a-z0-9-]+/);
        await expect(page.getByLabel('Flag', { exact: true })).toHaveCount(0);
        await expect(page.getByTestId('progress-panel')).toHaveAttribute('data-status', 'completed');
    });

    test('a completed lab shows the result, never a form, and keeps the hints readable', async ({ page }) => {
        const state = freshState();
        state.progress[SQL] = started({ status: 'completed', hintsUsed: [1], attempts: 2, pointsEarned: 30, completedAt: new Date().toISOString() });
        await open(page, MEMBER, `/labs/${SQL}`, state);
        await expect(page.getByTestId('completed-panel')).toBeVisible();
        await expect(page.getByTestId('completed-panel')).toContainText('30');
        await expect(page.getByLabel('Flag', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Start lab' })).toHaveCount(0);
        await expect(page.getByTestId('lab-hint').nth(1)).toContainText('Try a single quote.');
    });

    test('a lab without a flag cannot be completed: the member is told, not stuck', async ({ page }) => {
        const state = freshState();
        state.progress[NO_FLAG] = started();
        await open(page, MEMBER, `/labs/${NO_FLAG}`, state);
        await sendFlag(page, 'flag{anything}');
        await expect(page.getByTestId('flag-status')).toContainText(/no flag|not ready|cannot be completed/i);
        await expect(page.getByLabel('Flag', { exact: true })).toBeEnabled();
    });

    test('the target and the files open safely', async ({ page }) => {
        await open(page, MEMBER, `/labs/${SQL}`);
        const target = page.getByTestId('lab-target-link');
        await expect(target).toHaveAttribute('href', 'https://target.example.org/app');
        await expect(target).toHaveAttribute('target', '_blank');
        await expect(target).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
        await expect(page.getByTestId('target-note')).toContainText('Use only this target');
        const file = page.getByTestId('lab-file').getByRole('link').first();
        await expect(file).toHaveAttribute('href', 'https://files.example.org/app.zip');
        await expect(file).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
        await expect(page.getByTestId('lab-file')).toContainText('2 KB');
    });

    test('a lab with no target says so', async ({ page }) => {
        await open(page, MEMBER, '/labs/pcap-forensics');
        await expect(page.getByTestId('lab-target-link')).toHaveCount(0);
        await expect(page.getByText('This lab has no target to open')).toBeVisible();
    });

    test('markdown in instructions and hints is inert: nothing runs, nothing links to javascript:', async ({ page }) => {
        const state = freshState();
        state.progress[PAYLOAD] = started({ hintsUsed: [0] });
        const dialogs: string[] = [];
        page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
        await open(page, MEMBER, `/labs/${PAYLOAD}`, state);
        await expect(page.getByRole('heading', { name: 'Payload Lab', level: 1 })).toBeVisible();
        await expect(page.getByTestId('lab-hint').first()).toHaveAttribute('data-opened', 'true');
        // The page is hydrated and quiet: the member's own answer is in, so the browser-side pass has run too
        await expect(page.getByTestId('flag-form')).toHaveAttribute('data-phase', 'idle');
        await page.waitForLoadState('networkidle');

        expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
        expect(dialogs).toEqual([]);
        for (const box of await page.getByTestId('lab-markdown').all()) {
            expect(await box.locator('script').count()).toBe(0);
            expect(await box.locator('img').count()).toBe(0);
            expect(await box.locator('a[href^="javascript:" i]').count()).toBe(0);
            const handlers = await box.evaluate((el) => [el, ...Array.from(el.querySelectorAll('*'))].flatMap((n) => Array.from(n.attributes).map((a) => a.name)).filter((n) => n.startsWith('on')));
            expect(handlers).toEqual([]);
        }
        // The code fence is shown as text
        await expect(page.getByText('<script>alert(1)</script>')).toBeVisible();
    });

    test('staff open a draft, and a visitor never sees it', async ({ page, browser }) => {
        await open(page, ADMIN, `/labs/${DRAFT}`);
        await expect(page.getByRole('heading', { name: 'Secret Draft Lab', level: 1 })).toBeVisible();
        await expect(page.getByTestId('staff-note')).toBeVisible();
        await expect(page.getByRole('link', { name: /Edit/ }).first()).toHaveAttribute('href', `/admin/labs/${DRAFT}/edit`);

        const visitor = await browser.newPage();
        await mockLabsApi(visitor, VISITOR);
        await visitor.goto(`/labs/${DRAFT}`);
        await expect(visitor.getByRole('heading', { name: 'Secret Draft Lab', level: 1 })).toHaveCount(0);
        await expect(visitor.getByText(/not available|not found/i).first()).toBeVisible();
        await visitor.close();
    });

    test('the best solvers of a lab are listed as text', async ({ page }) => {
        await open(page, VISITOR, `/labs/${SQL}`);
        const solvers = page.getByTestId('top-solvers');
        await expect(solvers.getByTestId('solver-row')).toHaveCount(2);
        await expect(solvers).toContainText('Ada Lovelace');
        await expect(solvers.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/user/ada');
    });
});

test.describe('Leaderboard', () => {
    test('the leaderboard tab shows the board, a category, and the empty state', async ({ page }) => {
        await open(page, VISITOR, '/labs');
        await page.getByRole('tab', { name: 'Leaderboard' }).click();
        await expect(page).toHaveURL(/tab=leaderboard/);
        await expect(page.getByTestId('board-row')).toHaveCount(3);
        await expect(page.getByTestId('board-row').first()).toContainText('Ada Lovelace');
        await expect(page.getByTestId('board-row').first()).toContainText('450');

        await page.getByLabel('Category').selectOption('osint');
        await expect(page).toHaveURL(/category=osint/);
        await expect(page.getByRole('heading', { name: 'No completions yet' })).toBeVisible();

        await page.getByRole('tab', { name: 'Labs' }).click();
        await expect(page.getByTestId('lab-card').first()).toBeVisible();
    });

    test('the tab opens straight from the address, and a member sees their stats card', async ({ page }) => {
        const state = freshState();
        state.progress[SQL] = started({ status: 'completed', pointsEarned: 50, completedAt: new Date().toISOString() });
        await open(page, MEMBER, '/labs?tab=leaderboard', state);
        await expect(page.getByRole('tab', { name: 'Leaderboard' })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByTestId('board-row')).toHaveCount(3);
        await expect(page.getByTestId('labs-stats')).toContainText('50');
    });
});

test.describe('Labs admin', () => {
    test('a moderator is turned away, and a member too', async ({ page }) => {
        await open(page, MODERATOR, '/admin/labs');
        await expect(page.getByText('Only administrators and owners can manage labs.')).toBeVisible();
        await expect(page.getByTestId('admin-lab')).toHaveCount(0);
        const member = await page.context().newPage();
        await mockLabsApi(member, MEMBER);
        await member.goto('/admin/labs/create');
        await expect(member.getByText('Only administrators and owners can manage labs.')).toBeVisible();
        await expect(member.getByLabel('Title')).toHaveCount(0);
    });

    test('the list shows every status with counters and warns about a published lab without a flag', async ({ page }) => {
        await open(page, ADMIN, '/admin/labs');
        await expect(page.getByTestId('admin-lab').first()).toBeVisible();
        await expect(page.getByTestId('admin-lab').filter({ hasText: 'Secret Draft Lab' })).toHaveAttribute('data-status', 'draft');
        await expect(page.getByTestId('admin-lab').filter({ hasText: 'No Flag Lab' }).getByTestId('no-flag-warning')).toBeVisible();
        await expect(page.getByTestId('unflagged-banner')).toBeVisible();
        await expect(page.getByTestId('admin-lab').filter({ hasText: 'SQL Injection Basics' }).getByTestId('admin-counts')).toContainText('1 flag');

        await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: 'Draft' }).click();
        await expect(page.getByTestId('admin-lab')).toHaveCount(1);
    });

    test('creating a lab sends the flags typed, and publishing without one is stopped on the screen', async ({ page }) => {
        const state = await open(page, ADMIN, '/admin/labs/create');
        await page.getByLabel('Title').fill('Brand New Lab');
        await page.getByLabel('Description').fill('A short exercise about headers.');
        await page.getByLabel('Category').selectOption('web-security');
        await page.getByLabel('Difficulty').selectOption('medium');
        await page.getByLabel('Tags').fill('headers, web');
        await page.getByLabel('Status').selectOption('published');

        await page.getByRole('button', { name: 'Create and publish' }).click();
        await expect(page.getByTestId('form-error')).toBeVisible();
        expect(state.calls.some((c) => c.method === 'POST' && c.path === '/')).toBe(false);

        await page.getByRole('button', { name: 'Add a flag' }).click();
        await page.getByLabel(/^Flag 1\b/).fill('flag{brand_new}');
        await page.getByRole('button', { name: 'Create and publish' }).click();
        await expect(page).toHaveURL(/\/admin\/labs$/);

        const create = state.calls.find((c) => c.method === 'POST' && c.path === '/');
        expect(create?.body).toMatchObject({ title: 'Brand New Lab', category: 'web-security', difficulty: 'medium', status: 'published', tags: ['headers', 'web'] });
        expect(JSON.stringify(create?.body?.flags)).toContain('flag{brand_new}');
        await expect(page.getByTestId('admin-lab').filter({ hasText: 'Brand New Lab' })).toBeVisible();
        // The flag is not shown anywhere afterwards
        await expect(page.getByText('flag{brand_new}')).toHaveCount(0);
    });

    test('a slug that is taken is reported on its own field', async ({ page }) => {
        await open(page, ADMIN, '/admin/labs/create');
        await page.getByLabel('Title').fill('Copycat');
        await page.getByLabel('Slug').fill(SQL);
        await page.getByLabel('Description').fill('Another lab.');
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.getByLabel('Slug')).toHaveAttribute('aria-invalid', 'true');
        await expect(page.getByTestId('form-error')).toBeVisible();
    });

    test('an edit starts with no flag rows, says so, and leaves the flags out unless new ones are typed', async ({ page }) => {
        const state = await open(page, ADMIN, `/admin/labs/${SQL}/edit`);
        await expect(page.getByLabel('Title')).toHaveValue('SQL Injection Basics');
        await expect(page.getByTestId('flag-row')).toHaveCount(0);
        await expect(page.getByTestId('flags-note')).toContainText('This lab has 1 flag set');
        await expect(page.getByText('flag{sql_basics}')).toHaveCount(0);

        await page.getByLabel('Title').fill('SQL Injection Basics, revised');
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page).toHaveURL(/\/admin\/labs$/);
        const first = state.calls.filter((c) => c.method === 'PUT')[0];
        expect(first.path).toBe(`/${SQL}`);
        expect(first.body).toMatchObject({ title: 'SQL Injection Basics, revised' });
        expect(first.body).not.toHaveProperty('flags');
        expect(state.labs.find((l) => l.slug === SQL)?.flags).toEqual([{ value: 'flag{sql_basics}', caseSensitive: false }]);

        await page.goto(`/admin/labs/${SQL}/edit`);
        await page.getByRole('button', { name: 'Enter new flags' }).click();
        await page.getByLabel(/^Flag 1\b/).fill('flag{replaced}');
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page).toHaveURL(/\/admin\/labs$/);
        const second = state.calls.filter((c) => c.method === 'PUT')[1];
        expect(JSON.stringify(second.body?.flags)).toContain('flag{replaced}');
        expect(state.labs.find((l) => l.slug === SQL)?.flags[0].value).toBe('flag{replaced}');
    });

    test('a lab with completions cannot be deleted: archive is offered and works', async ({ page }) => {
        const state = await open(page, ADMIN, `/admin/labs/${SQL}/edit`);
        await expect(page.getByLabel('Title')).toHaveValue('SQL Injection Basics');
        await page.getByRole('button', { name: 'Delete lab' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Delete lab' }).click();
        await expect(page.getByRole('dialog')).toContainText('Members have completed this lab');
        await page.getByRole('dialog').getByRole('button', { name: 'Archive lab' }).click();
        await expect(page).toHaveURL(/\/admin\/labs$/);
        expect(state.labs.find((l) => l.slug === SQL)?.status).toBe('archived');
    });

    test('a lab nobody completed can be deleted', async ({ page }) => {
        const state = freshState();
        state.labs.find((l) => l.slug === 'osint-trail')!.completionCount = 0;
        await open(page, ADMIN, '/admin/labs/osint-trail/edit', state);
        await page.getByRole('button', { name: 'Delete lab' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Delete lab' }).click();
        await expect(page).toHaveURL(/\/admin\/labs$/);
        expect(state.labs.some((l) => l.slug === 'osint-trail')).toBe(false);
    });

    test('hints and files can be added, and a file link to a private address is refused by the server', async ({ page }) => {
        const state = await open(page, ADMIN, '/admin/labs/create');
        await page.getByLabel('Title').fill('With Extras');
        await page.getByLabel('Description').fill('Has hints and a file.');
        await page.getByRole('button', { name: 'Add a hint' }).click();
        await page.getByLabel('Hint 1 text').fill('Look closer.');
        await page.getByLabel('Hint 1 cost in points').fill('15');
        await page.getByRole('button', { name: 'Add a file' }).click();
        await page.getByLabel('File 1 name').fill('notes.txt');
        await page.getByLabel('File 1 link').fill('https://192.168.0.1/notes.txt');
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.getByLabel('File 1 link')).toHaveAttribute('aria-invalid', 'true');
        expect(state.calls.some((c) => c.method === 'POST' && c.path === '/')).toBe(false);

        await page.getByLabel('File 1 link').fill('https://files.example.org/notes.txt');
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page).toHaveURL(/\/admin\/labs$/);
        const create = state.calls.find((c) => c.method === 'POST' && c.path === '/');
        expect(create?.body).toMatchObject({ hints: [{ text: 'Look closer.', penalty: 15 }], files: [{ name: 'notes.txt', url: 'https://files.example.org/notes.txt' }] });
    });
});

test.describe('Phone width (390px)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('list, workspace, leaderboard and admin screens do not scroll sideways', async ({ page }) => {
        const state = freshState();
        state.progress[SQL] = started({ hintsUsed: [0] });
        await open(page, ADMIN, '/labs', state);
        await expect(page.getByTestId('lab-card').first()).toBeVisible();
        await noHorizontalScroll(page);

        await page.goto(`/labs/${SQL}`);
        await expect(page.getByRole('heading', { name: 'SQL Injection Basics', level: 1 })).toBeVisible();
        await expect(page.getByTestId('flag-form')).toBeVisible();
        await noHorizontalScroll(page);

        await page.goto(`/labs/${PAYLOAD}`);
        await expect(page.getByRole('heading', { name: 'Payload Lab', level: 1 })).toBeVisible();
        await noHorizontalScroll(page);

        await page.goto('/labs?tab=leaderboard');
        await expect(page.getByTestId('board-row').first()).toBeVisible();
        await noHorizontalScroll(page);

        await page.goto('/admin/labs');
        await expect(page.getByTestId('admin-lab').first()).toBeVisible();
        await noHorizontalScroll(page);

        await page.goto(`/admin/labs/${SQL}/edit`);
        await expect(page.getByLabel('Title')).toHaveValue('SQL Injection Basics');
        await noHorizontalScroll(page);
    });
});
