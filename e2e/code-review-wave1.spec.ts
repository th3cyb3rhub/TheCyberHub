import { test, expect, type Locator, type Page } from '@playwright/test';
import {
    ADMIN, DRAFT, LOGIN, MEMBER, MODERATOR, NO_FINDINGS, VISITOR, XSS, LOGIN_CODE,
    freshState, mockCodeReviewApi, tried, type MockState, type Role,
} from './code-review-mocks';

/** The mock API answers every call, and the server render fails soft (no backend runs here), so the browser loads each page. */
async function open(page: Page, who: Role, path: string, state: MockState = freshState()) {
    await mockCodeReviewApi(page, who, state);
    await page.goto(path);
    return state;
}

const noHorizontalScroll = async (page: Page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
};

const SIZES = [
    { name: 'phone 390', viewport: { width: 390, height: 844 }, touch: true },
    { name: 'desktop 1280', viewport: { width: 1280, height: 900 }, touch: false },
] as const;

const line = (page: Page, n: number) => page.locator(`#cr-line-${n}`);
/** A tap on a touch screen, a click otherwise */
const hit = (locator: Locator, touch: boolean) => (touch ? locator.tap() : locator.click());
const posts = (state: MockState, suffix: string) => state.calls.filter((c) => c.method === 'POST' && c.path.endsWith(suffix));

for (const size of SIZES) {
    test.describe(`Code review at ${size.name}`, () => {
        test.use({ viewport: size.viewport, hasTouch: size.touch });

        test.describe('list', () => {
            test('lists published exercises, filters in the address, searches and shows no draft', async ({ page }) => {
                await open(page, VISITOR, '/code-review');
                await expect(page.getByRole('heading', { name: 'Code Review', level: 1 })).toBeVisible();
                await expect(page.getByTestId('cr-card')).toHaveCount(4);
                await expect(page.getByText('Unfinished draft')).toHaveCount(0);
                await expect(page.getByTestId('cr-count')).toContainText('4 exercises');
                await expect(page.getByRole('group', { name: 'My progress' })).toHaveCount(0);
                await expect(page.getByTestId('cr-stats')).toHaveCount(0);

                await page.getByRole('button', { name: /^Hard/ }).click();
                await expect(page).toHaveURL(/difficulty=hard/);
                await expect(page.getByTestId('cr-card')).toHaveCount(1);
                await expect(page.getByTestId('cr-card')).toContainText('File download');

                await page.getByRole('button', { name: 'Clear filters' }).click();
                await expect(page).not.toHaveURL(/difficulty=/);
                await page.getByLabel('Language').selectOption('javascript');
                await expect(page).toHaveURL(/language=javascript/);
                await expect(page.getByTestId('cr-card')).toHaveCount(1);

                await page.getByRole('button', { name: 'Clear filters' }).click();
                await page.getByLabel('Search exercises').fill('login');
                await expect(page).toHaveURL(/q=login/);
                await expect(page.getByTestId('cr-card')).toHaveCount(1);
                await expect(page.getByTestId('cr-card')).toContainText('Login check');

                await page.getByLabel('Search exercises').fill('zzzz');
                await expect(page.getByRole('heading', { name: 'No exercises match these filters' })).toBeVisible();
                await noHorizontalScroll(page);
            });

            test('filters by the six broad categories, and an old category in the address is no filter', async ({ page }) => {
                await open(page, VISITOR, '/code-review');
                // the counts come from the totals: wait until they are in
                await expect(page.getByLabel('Category')).toContainText('Injection (1)');
                const options = await page.getByLabel('Category').locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).textContent));
                expect(options).toEqual(['All categories', 'Injection (1)', 'Web (1)', 'Cryptography (1)', 'Server side (1)']);
                await page.getByLabel('Category').selectOption('web');
                await expect(page).toHaveURL(/category=web/);
                await expect(page.getByTestId('cr-card')).toHaveCount(1);
                await expect(page.getByTestId('cr-card')).toContainText('Search results page');

                // a category of the first release is not an error: it simply filters nothing
                await page.goto('/code-review?category=sqli');
                await expect(page.getByTestId('cr-card')).toHaveCount(4);
                await expect(page.getByTestId('cr-error')).toHaveCount(0);
            });

            test('names the plain list as its canonical address, also when filtered', async ({ page }) => {
                await open(page, VISITOR, '/code-review?category=web&difficulty=medium');
                await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/code-review$/);
            });

            test('opens an exercise from its card', async ({ page }) => {
                await open(page, VISITOR, '/code-review');
                await page.getByRole('link', { name: 'Login check' }).first().click();
                await expect(page).toHaveURL(new RegExp(`/code-review/${LOGIN}$`));
                await expect(page.getByRole('heading', { name: 'Login check', level: 1 })).toBeVisible();
            });

            test('a member sees progress chips, the progress header and the status filter', async ({ page }) => {
                const state = freshState();
                state.progress[LOGIN] = tried({ passed: true, bestPercent: 100, bestScore: 20, pointsEarned: 25 });
                await open(page, MEMBER, '/code-review', state);
                await expect(page.getByTestId('cr-stats')).toBeVisible();
                await expect(page.getByTestId('stat-passed')).toHaveText('1');
                await expect(page.getByTestId('stat-points')).toHaveText('25');
                await expect(page.getByTestId('cr-card').filter({ hasText: 'Login check' })).toHaveAttribute('data-status', 'passed');
                await page.getByRole('button', { name: 'Passed', exact: true }).click();
                await expect(page).toHaveURL(/status=passed/);
                await expect(page.getByTestId('cr-card')).toHaveCount(1);
                expect(state.calls.some((c) => c.path === '/' && c.query?.includes('status=passed'))).toBe(true);
            });

            test('shows an honest error with a retry, and never a local copy', async ({ page }) => {
                const state = freshState({ failGet: ['/'] });
                await open(page, VISITOR, '/code-review', state);
                await expect(page.getByTestId('cr-error')).toBeVisible();
                await expect(page.getByTestId('cr-card')).toHaveCount(0);
                state.failGet = [];
                await page.getByRole('button', { name: 'Try again' }).click();
                await expect(page.getByTestId('cr-card')).toHaveCount(4);
            });

            test('says plainly when nothing is published', async ({ page }) => {
                await open(page, VISITOR, '/code-review', freshState({ snippets: [] }));
                await expect(page.getByRole('heading', { name: 'No exercises are published yet' })).toBeVisible();
            });
        });

        test.describe('exercise, visitor', () => {
            test('shows the code as text, marks lines by click and range, and asks to sign in to submit', async ({ page }) => {
                const state = await open(page, VISITOR, `/code-review/${LOGIN}`);
                await expect(page.getByRole('heading', { name: 'Login check', level: 1 })).toBeVisible();
                await expect(page.getByTestId('code-card').locator('[role="option"]')).toHaveCount(7);
                await expect(line(page, 4)).toContainText('SELECT * FROM users');

                await hit(line(page, 4), size.touch);
                await expect(page.getByTestId('selection-status')).toContainText(/line 4/i);
                await page.getByTestId('range-mode').click();
                await hit(line(page, 5), size.touch);
                await expect(page.getByTestId('selection-status')).toContainText(/lines 4 to 5/i);
                await page.getByTestId('mark-selection').click();
                await expect(page.getByTestId('mark-item')).toHaveCount(1);
                await expect(page.getByTestId('mark-item')).toContainText(/lines 4 to 5/i);

                // a type and a removal
                await page.getByLabel('Vulnerability type for lines 4 to 5').selectOption('sqli');
                await expect(page.getByLabel('Vulnerability type for lines 4 to 5')).toHaveValue('sqli');
                await page.getByRole('button', { name: 'Remove mark on lines 4 to 5' }).click();
                await expect(page.getByTestId('mark-item')).toHaveCount(0);

                await expect(page.getByTestId('signin-prompt')).toBeVisible();
                await expect(page.getByRole('link', { name: /Sign in to submit/ })).toHaveAttribute('href', `/auth?redirect=${encodeURIComponent(`/code-review/${LOGIN}`)}`);
                await expect(page.getByTestId('submit-marks')).toHaveCount(0);
                await expect(page.getByTestId('solution-locked')).toBeVisible();
                expect(posts(state, '/attempts')).toHaveLength(0);
                await noHorizontalScroll(page);
            });

            test('the keyboard marks a range without a pointer', async ({ page }) => {
                test.skip(size.touch, 'keyboard path');
                await open(page, VISITOR, `/code-review/${LOGIN}`);
                await page.getByRole('listbox').focus();
                await page.keyboard.press('Space');
                await expect(page.getByTestId('selection-status')).toContainText(/line 1/i);
                await page.keyboard.press('ArrowDown');
                await page.keyboard.press('ArrowDown');
                await page.keyboard.press('ArrowDown');
                await expect(page.getByTestId('selection-status')).toContainText(/line 4/i);
                await page.keyboard.press('Shift+ArrowDown');
                await expect(page.getByTestId('selection-status')).toContainText(/lines 4 to 5/i);
                await page.keyboard.press('Space');
                await expect(page.getByTestId('mark-item')).toHaveCount(1);
                await page.keyboard.press('Space');
                await expect(page.getByTestId('mark-item')).toHaveCount(0);
            });

            test('a hostile sample is shown as text and nothing runs', async ({ page }) => {
                await open(page, VISITOR, `/code-review/${XSS}`);
                await expect(line(page, 3)).toContainText('onerror=\\"track()\\"');
                await expect(page.getByTestId('code-card').locator('img, script')).toHaveCount(0);
                await expect(page.getByTestId('code-card')).toContainText('<h1>Results for');
            });

            test('says an unknown or draft exercise is not available, with no code', async ({ page }) => {
                await open(page, VISITOR, `/code-review/${DRAFT}`);
                await expect(page.getByRole('heading', { name: 'This exercise is not available' })).toBeVisible();
                await expect(page.getByTestId('code-card')).toHaveCount(0);
            });

            test('shows an error with a retry when the API fails', async ({ page }) => {
                const state = freshState({ failGet: [`/${LOGIN}`] });
                await open(page, VISITOR, `/code-review/${LOGIN}`, state);
                await expect(page.getByText('Could not load this exercise')).toBeVisible();
                state.failGet = [];
                await page.getByRole('button', { name: 'Try again' }).click();
                await expect(page.getByRole('heading', { name: 'Login check', level: 1 })).toBeVisible();
            });
        });

        test.describe('exercise, member', () => {
            const mark = async (page: Page, from: number, to = from) => {
                await hit(line(page, from), size.touch);
                if (to !== from) {
                    await page.getByTestId('range-mode').click();
                    await hit(line(page, to), size.touch);
                }
                await page.getByTestId('mark-selection').click();
            };

            test('marks, submits and reads the result before a pass: counts and a verdict per mark, no explanation, attempts left', async ({ page }) => {
                const state = await open(page, MEMBER, `/code-review/${LOGIN}`);
                await expect(page.getByTestId('attempts-left')).toContainText('30 graded attempts left today');
                await mark(page, 4, 5);
                await mark(page, 2);
                await page.getByTestId('submit-marks').click();

                const result = page.getByTestId('result');
                await expect(result).toBeVisible();
                await expect(page.getByTestId('score')).toContainText('7');
                await expect(page.getByTestId('pass-state')).toContainText(/not passed/i);
                await expect(page.getByTestId('found-count')).toContainText('1 of 2 found');
                await expect(page.getByTestId('missed-count')).toContainText('1');
                await expect(page.getByTestId('false-count')).toContainText('1');
                await expect(page.getByTestId('false-cost')).toContainText('cost 3 points');
                // Before a pass nothing explains what was found, and the missed finding stays secret
                await expect(page.getByTestId('details-locked')).toContainText('unlock when you pass or after you open the solution');
                await expect(page.getByTestId('finding')).toHaveCount(0);
                await expect(result).not.toContainText('concatenated');
                await expect(result).not.toContainText('Timing difference');
                // the verdict of each mark is there, and the marks that matched are green
                await expect(page.getByTestId('mark-verdicts').locator('[data-verdict="matched"]')).toHaveCount(1);
                await expect(line(page, 4)).toHaveAttribute('data-tone', 'match');
                await expect(line(page, 2)).toHaveAttribute('data-tone', 'mark');
                await expect(page.getByTestId('attempts-left')).toContainText('29 graded attempts left today');
                expect(posts(state, '/attempts')[0].body).toEqual({ marks: [{ lineStart: 2, lineEnd: 2 }, { lineStart: 4, lineEnd: 5 }] });
                await noHorizontalScroll(page);
            });

            test('a pass shows points, the new badge and the explanation of each finding found', async ({ page }) => {
                await open(page, MEMBER, `/code-review/${LOGIN}`);
                await mark(page, 4, 5);
                await mark(page, 7);
                await page.getByTestId('submit-marks').click();
                await expect(page.getByTestId('pass-state')).toContainText(/passed/i);
                await expect(page.getByTestId('points-line')).toContainText('25');
                await expect(page.getByTestId('new-badges')).toContainText('First Review');
                await expect(page.getByTestId('found-count')).toContainText('2 of 2 found');
                await expect(page.getByTestId('details-locked')).toHaveCount(0);
                await expect(page.getByTestId('finding')).toHaveCount(2);
                await expect(page.getByTestId('result')).toContainText('concatenated');
            });

            test('later attempts pay less: 25% off for each earlier graded attempt', async ({ page }) => {
                const state = freshState();
                state.progress[LOGIN] = tried();
                await open(page, MEMBER, `/code-review/${LOGIN}`, state);
                // one graded attempt before: a perfect pass pays 75% of 25, rounded
                await expect(page.getByTestId('points-value')).toContainText('19 points');
                await expect(page.getByTestId('rules-box')).toContainText('takes 25% off (at most 75%)');
            });

            test('more wrong marks than findings takes the points away, and says so', async ({ page }) => {
                await open(page, MEMBER, `/code-review/${LOGIN}`);
                await mark(page, 1);
                await mark(page, 2);
                await mark(page, 3);
                await page.getByTestId('submit-marks').click();
                await expect(page.getByTestId('forfeited')).toContainText('3 wrong marks, more than the 2 findings');
                await expect(page.getByTestId('false-cost')).toContainText('cost 9 points');
                await expect(page.getByTestId('forfeited-note')).toContainText('its points are gone');
                await expect(page.getByTestId('points-value')).toContainText('0 points');
            });

            test('shows the limit of marks and lines as it is used, and stops adding beyond it', async ({ page }) => {
                await open(page, MEMBER, `/code-review/${LOGIN}`);
                await expect(page.getByTestId('marks-count')).toContainText('0 of 4 marks, 0 of 6 lines');
                for (const n of [1, 3, 5, 7]) await mark(page, n);
                await expect(page.getByTestId('marks-count')).toContainText('4 of 4 marks, 4 of 6 lines');
                await hit(line(page, 2), size.touch);
                await expect(page.getByTestId('mark-selection')).toBeDisabled();
                await expect(page.getByTestId('limit-note')).toContainText('at most 4 marks');
                await noHorizontalScroll(page);
            });

            test('follows the limits the API names when it refuses an answer as too broad', async ({ page }) => {
                const state = await open(page, MEMBER, `/code-review/${LOGIN}`);
                state.failOnce['POST /attempts'] = { status: 400, code: 'CR_TOO_BROAD', message: 'Too broad', meta: { maxMarks: 3, maxLines: 5 } };
                await mark(page, 4);
                await page.getByTestId('submit-marks').click();
                await expect(page.getByTestId('submit-error')).toContainText('at most 3 marks covering at most 5 lines');
                await expect(page.getByTestId('marks-count')).toContainText('1 of 3 marks, 1 of 5 lines');
                await expect(page.getByTestId('mark-item')).toHaveCount(1);
            });

            test('every line has a spoken number, and the type chooser offers the finding types', async ({ page }) => {
                await open(page, MEMBER, `/code-review/${LOGIN}`);
                await expect(page.getByRole('option', { name: /^Line 4:/ })).toBeVisible();
                await hit(line(page, 4), size.touch);
                await expect(page.getByTestId('selection-status')).toHaveAttribute('aria-live', 'polite');
                const values = await page.getByLabel('Type for new marks (optional)').locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
                expect(values).toContain('sqli');
                expect(values).toContain('race-condition');
                expect(values).not.toContain('server-side');
            });

            test('opened by its id every panel keeps working: marks, hint, solution', async ({ page }) => {
                const id = 'bbbbbbbbbbbbbbbbbbbbbbb1';
                const state = await open(page, MEMBER, `/code-review/${id}`);
                await expect(page.getByRole('heading', { name: 'Login check', level: 1 })).toBeVisible();
                await mark(page, 4, 5);
                await page.getByTestId('submit-marks').click();
                await expect(page.getByTestId('result')).toBeVisible();
                await expect(page.getByTestId('progress-panel')).toContainText('Attempts1');
                await page.getByRole('button', { name: 'Open hint 1' }).click();
                await page.getByRole('button', { name: /^Open for/ }).click();
                await expect(page.getByTestId('cr-hint').nth(0)).toContainText('Opened');
                await expect(page.getByTestId('points-value')).toContainText('16 points');
                await page.getByTestId('solution-panel').getByRole('button', { name: 'Show solution' }).click();
                await page.getByRole('button', { name: 'Open the solution' }).click();
                await expect(page.getByTestId('solution-body')).toBeVisible();
                // every call went to the address of the page
                const own = state.calls.filter((c) => c.method !== 'GET' || c.path.endsWith('/solution') || c.path.endsWith('/attempts'));
                expect(own.length).toBeGreaterThan(3);
                for (const c of own) expect(c.path.startsWith(`/${id}`)).toBe(true);
            });

            test('opens hints in order after a confirm, showing the cost', async ({ page }) => {
                const state = await open(page, MEMBER, `/code-review/${LOGIN}`);
                const hints = page.getByTestId('cr-hint');
                await expect(hints.nth(0)).toContainText('Costs 3 points');
                await expect(page.getByRole('button', { name: 'Open hint 2' })).toBeDisabled();
                await page.getByRole('button', { name: 'Open hint 1' }).click();
                const dialog = page.getByRole('dialog');
                await expect(dialog).toContainText('takes 3 points off');
                await page.getByRole('button', { name: 'Keep it closed' }).click();
                expect(posts(state, '/hints/1')).toHaveLength(0);

                await page.getByRole('button', { name: 'Open hint 1' }).click();
                await page.getByRole('button', { name: 'Open for 3 points' }).click();
                await expect(hints.nth(0)).toContainText('Look at how the query is built.');
                await expect(hints.nth(0)).toContainText('Opened');
                expect(posts(state, '/hints/1')).toHaveLength(1);
                await expect(page.getByRole('button', { name: 'Open hint 2' })).toBeEnabled();
            });

            test('the solution is locked until the first attempt, then asks before it opens', async ({ page }) => {
                const state = await open(page, MEMBER, `/code-review/${LOGIN}`);
                await expect(page.getByTestId('solution-locked')).toContainText('locked until your first graded attempt');
                await expect(page.getByRole('button', { name: 'Show solution' })).toBeDisabled();

                await mark(page, 4);
                await page.getByTestId('submit-marks').click();
                await expect(page.getByTestId('result')).toBeVisible();

                const open_ = page.getByTestId('solution-panel').getByRole('button', { name: 'Show solution' });
                await expect(open_).toBeEnabled();
                await open_.click();
                const dialog = page.getByRole('dialog');
                await expect(dialog).toContainText('pays 0 points');
                await page.getByRole('button', { name: 'Keep trying' }).click();
                expect(state.calls.filter((c) => c.path.endsWith('/solution'))).toHaveLength(0);

                await open_.click();
                await page.getByRole('button', { name: 'Open the solution' }).click();
                const body = page.getByTestId('solution-body');
                await expect(body).toBeVisible();
                await expect(body).toContainText('All findings (2)');
                await expect(body).toContainText('Timing difference');
                await expect(body).toContainText('cursor.execute("SELECT * FROM users WHERE name = ?", (username,))');
                await noHorizontalScroll(page);
            });

            test('shows a countdown after a 429 wait and clears it', async ({ page }) => {
                const state = await open(page, MEMBER, `/code-review/${LOGIN}`);
                state.failOnce['POST /attempts'] = { status: 429, code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', meta: { retryAfter: 3 } };
                await mark(page, 4);
                await page.getByTestId('submit-marks').click();
                await expect(page.getByTestId('wait-notice')).toContainText(/\d seconds?/);
                await expect(page.getByTestId('submit-marks')).toBeDisabled();
                await expect(page.getByTestId('wait-notice')).toHaveCount(0, { timeout: 8000 });
                await expect(page.getByTestId('submit-marks')).toBeEnabled();
                await page.getByTestId('submit-marks').click();
                await expect(page.getByTestId('result')).toBeVisible();
            });

            test('names the daily limit, keeps the marks', async ({ page }) => {
                const state = await open(page, MEMBER, `/code-review/${LOGIN}`);
                state.failOnce['POST /attempts'] = { status: 429, code: 'CR_ATTEMPT_LIMIT', message: 'Daily limit', meta: { retryAfter: 7200, limit: 30 } };
                await mark(page, 4);
                await page.getByTestId('submit-marks').click();
                await expect(page.getByTestId('submit-error')).toContainText('30');
                await expect(page.getByTestId('wait-notice')).toHaveCount(0);
                await expect(page.getByTestId('mark-item')).toHaveCount(1);
            });

            test('says an exercise without findings cannot be graded, and refuses stale-state errors in words', async ({ page }) => {
                const state = await open(page, MEMBER, `/code-review/${LOGIN}`);
                state.failOnce['POST /attempts'] = { status: 409, code: 'CR_NOT_GRADABLE', message: 'No findings' };
                await mark(page, 4);
                await page.getByTestId('submit-marks').click();
                await expect(page.getByTestId('submit-error')).toBeVisible();
                await expect(page.getByTestId('mark-item')).toHaveCount(1);
            });

            test('the history of attempts lists earlier tries', async ({ page }) => {
                const state = freshState();
                state.progress[LOGIN] = tried();
                await open(page, MEMBER, `/code-review/${LOGIN}`, state);
                await expect(page.getByRole('heading', { name: /Your attempts|Attempts/ })).toBeVisible();
                await expect(page.getByText('35%').first()).toBeVisible();
            });
        });

        test.describe('staff on an exercise', () => {
            test('an admin sees the edit link and the solution without an attempt', async ({ page }) => {
                await open(page, ADMIN, `/code-review/${LOGIN}`);
                await expect(page.getByRole('link', { name: /Edit exercise/ })).toHaveAttribute('href', `/admin/code-review/${LOGIN}/edit`);
                await expect(page.getByText('As staff you can read the solution at any time.')).toBeVisible();
            });

            test('staff are told they are not scored, never "0 points"', async ({ page }) => {
                await open(page, ADMIN, `/code-review/${LOGIN}`);
                await expect(page.getByTestId('points-value')).toHaveText('Not scored for staff');
                await expect(page.getByTestId('progress-panel')).not.toContainText(/up to 0 points/i);
            });
        });

        test.describe('admin', () => {
            test('a member cannot open the admin list, a visitor is sent to sign in', async ({ page }) => {
                await open(page, MEMBER, '/admin/code-review');
                await expect(page.getByRole('heading', { name: 'You cannot open this page' })).toBeVisible();
            });

            test('lists every exercise, publishes, unpublishes and deletes after a confirm', async ({ page }) => {
                const state = await open(page, ADMIN, '/admin/code-review');
                await expect(page.getByTestId('admin-snippet')).toHaveCount(6);
                const draft = page.getByTestId('admin-snippet').filter({ hasText: 'Unfinished draft' });
                await expect(draft).toHaveAttribute('data-published', 'false');
                await expect(page.getByTestId('admin-snippet').filter({ hasText: 'No findings yet' }).getByTestId('no-finding-warning')).toBeVisible();

                await draft.getByRole('button', { name: /^Publish/ }).click();
                await expect(draft).toHaveAttribute('data-published', 'true');
                expect(posts(state, `/${DRAFT}/publish`)).toHaveLength(1);
                await draft.getByRole('button', { name: /^Unpublish/ }).click();
                await expect(draft).toHaveAttribute('data-published', 'false');

                // a passed exercise cannot be deleted: the page says why and offers to unpublish
                const login = page.getByTestId('admin-snippet').filter({ hasText: 'Login check' });
                await login.getByRole('button', { name: /^Delete/ }).click();
                await expect(page.getByRole('dialog')).toContainText('cannot be undone');
                await page.getByRole('button', { name: 'Delete exercise' }).click();
                await expect(login.getByTestId('row-error')).toContainText(/unpublish/i);

                const spare = page.getByTestId('admin-snippet').filter({ hasText: 'No findings yet' });
                await spare.getByRole('button', { name: /^Delete/ }).click();
                await page.getByRole('button', { name: 'Delete exercise' }).click();
                await expect(page.getByTestId('admin-snippet')).toHaveCount(5);
                await noHorizontalScroll(page);
            });

            test('a moderator reads the list and an exercise with no write control', async ({ page }) => {
                await open(page, MODERATOR, '/admin/code-review');
                await expect(page.getByTestId('admin-snippet')).toHaveCount(6);
                await expect(page.getByRole('link', { name: /New exercise/ })).toHaveCount(0);
                await expect(page.getByRole('list', { name: 'Exercises' }).getByRole('button')).toHaveCount(0);
                await page.getByRole('link', { name: /^Open Login check/ }).click();
                await expect(page.getByTestId('read-only-note')).toBeVisible();
                await expect(page.getByTestId('save-snippet')).toHaveCount(0);
                await expect(page.getByLabel(/^Title/)).toBeDisabled();
                await noHorizontalScroll(page);
            });

            test('a moderator cannot open the new page', async ({ page }) => {
                await open(page, MODERATOR, '/admin/code-review/new');
                await expect(page.getByText(/Only administrators and owners can create exercises/)).toBeVisible();
            });

            test('creates an exercise: code preview, findings picked on it, live validation, then saves', async ({ page }) => {
                const state = await open(page, ADMIN, '/admin/code-review/new');
                await expect(page.getByRole('heading', { name: 'New exercise', level: 1 })).toBeVisible();
                await expect(page.getByTestId('strip-note')).toContainText('stored exactly as written');
                await expect(page.getByLabel(/^Category/)).toHaveValue('injection');

                await page.getByLabel(/^Title/).fill('Fresh exercise');
                await page.getByLabel(/^Description/).fill('Find what is wrong in this sample.');
                await page.getByLabel(/^Vulnerable code/).fill(LOGIN_CODE);
                await expect(page.getByTestId('code-preview').getByRole('listitem')).toHaveCount(7);

                await page.getByRole('button', { name: /Add a finding/ }).click();
                const first = page.getByTestId('finding-row').first();
                await first.getByRole('button', { name: /Pick lines on the preview/ }).click();
                await expect(page.getByTestId('picking-banner')).toBeVisible();
                await hit(page.locator('#cr-preview-line-4'), size.touch);
                await hit(page.locator('#cr-preview-line-5'), size.touch);
                await expect(first.getByLabel(/first line/)).toHaveValue('4');
                await expect(first.getByLabel(/last line/)).toHaveValue('5');
                await first.getByLabel(/explanation/).fill('The name goes straight into the query.');

                // a second finding that shares line 5 is flagged before any save
                await page.getByRole('button', { name: /Add a finding/ }).click();
                const second = page.getByTestId('finding-row').nth(1);
                await second.getByLabel(/first line/).fill('5');
                await second.getByLabel(/last line/).fill('6');
                await second.getByLabel(/explanation/).fill('A second note about the same lines.');
                await expect(second).toContainText('Overlaps finding 1');
                await page.getByTestId('save-snippet').click();
                await expect(page.getByTestId('form-banner')).toContainText('Please fix');
                expect(posts(state, '/')).toHaveLength(0);

                await second.getByLabel(/first line/).fill('7');
                await second.getByLabel(/last line/).fill('9');
                await expect(second).toContainText('past the end of the code (7 lines)');
                await second.getByLabel(/last line/).fill('7');
                await expect(second).not.toContainText('past the end');

                await page.getByTestId('save-snippet').click();
                await expect(page).toHaveURL(/\/admin\/code-review$/);
                const created = posts(state, '/')[0];
                expect(created.body).toMatchObject({ title: 'Fresh exercise', isPublished: false });
                expect((created.body as { findings: unknown[] }).findings).toHaveLength(2);
                await expect(page.getByTestId('admin-snippet').filter({ hasText: 'Fresh exercise' })).toBeVisible();
            });

            test('shows server errors: slug taken and field details', async ({ page }) => {
                const state = await open(page, ADMIN, '/admin/code-review/new');
                await page.getByLabel(/^Title/).fill('Taken one');
                await page.getByLabel(/^Description/).fill('Find what is wrong in this sample.');
                await page.getByLabel(/^Vulnerable code/).fill(LOGIN_CODE);
                await page.getByRole('button', { name: /Add a finding/ }).click();
                const row = page.getByTestId('finding-row').first();
                await row.getByLabel(/first line/).fill('4');
                await row.getByLabel(/last line/).fill('4');
                await row.getByLabel(/explanation/).fill('The name goes straight into the query.');

                await page.getByLabel(/^Slug/).fill(LOGIN);
                await page.getByTestId('save-snippet').click();
                await expect(page.getByTestId('form-banner')).toBeVisible();
                await expect(page.getByLabel(/^Slug/)).toHaveAttribute('aria-invalid', 'true');

                await page.getByLabel(/^Slug/).fill('brand-new-slug');
                state.failOnce['POST /'] = { status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ field: 'title', message: 'Title is not acceptable' }, { message: 'The form as a whole is odd' }] };
                await page.getByTestId('save-snippet').click();
                await expect(page.getByText('Title is not acceptable')).toBeVisible();
                await expect(page.getByTestId('form-banner')).toContainText('The form as a whole is odd');
            });

            test('publishing an exercise without findings is refused by the form', async ({ page }) => {
                const state = await open(page, ADMIN, '/admin/code-review/new');
                await page.getByLabel(/^Title/).fill('No findings');
                await page.getByLabel(/^Description/).fill('Nothing marked yet at all.');
                await page.getByLabel(/^Vulnerable code/).fill(LOGIN_CODE);
                await page.getByRole('checkbox', { name: /Published/ }).check();
                await page.getByTestId('save-snippet').click();
                await expect(page.getByTestId('findings-error')).toContainText('Add at least one finding');
                expect(posts(state, '/')).toHaveLength(0);
            });

            test('edits an exercise and saves with the slug as the reference', async ({ page }) => {
                const state = await open(page, ADMIN, `/admin/code-review/${LOGIN}/edit`);
                await expect(page.getByLabel(/^Title/)).toHaveValue('Login check');
                await expect(page.getByTestId('slug-readonly')).toContainText(LOGIN);
                await expect(page.getByTestId('finding-row')).toHaveCount(2);
                await page.getByLabel(/^Title/).fill('Login check, revised');
                await page.getByTestId('save-snippet').click();
                await expect(page).toHaveURL(/\/admin\/code-review$/);
                const put = state.calls.find((c) => c.method === 'PUT');
                expect(put?.path).toBe(`/${LOGIN}`);
                expect(put?.body).toMatchObject({ title: 'Login check, revised' });
                await expect(page.getByTestId('admin-snippet').filter({ hasText: 'Login check, revised' })).toBeVisible();
            });

            test('keeps a script sample in the code as written and shows it as text, and warns only for titles and descriptions', async ({ page }) => {
                await open(page, ADMIN, '/admin/code-review/new');
                await page.getByLabel(/^Vulnerable code/).fill('el.innerHTML = "<img src=x onerror=alert(1)>"');
                await expect(page.getByTestId('strip-warning')).toHaveCount(0);
                await expect(page.getByTestId('code-preview')).toContainText('<img src=x onerror=alert(1)>');
                await expect(page.getByTestId('code-preview').locator('img')).toHaveCount(0);
                await page.getByLabel(/^Title/).fill('Greeting <script>alert(1)</script>');
                await expect(page.getByTestId('strip-warning')).toBeVisible();
            });

            test('the finding type chooser has the 15 types, the category chooser the 6 topics', async ({ page }) => {
                await open(page, ADMIN, '/admin/code-review/new');
                await expect(page.getByLabel(/^Category/)).toBeVisible();
                const categories = await page.getByLabel(/^Category/).locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
                expect(categories).toEqual(['injection', 'web', 'access-control', 'crypto', 'server-side', 'other']);
                await page.getByRole('button', { name: /Add a finding/ }).click();
                const types = await page.getByLabel(/vulnerability type/).locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
                expect(types).toHaveLength(15);
                expect(types).toContain('race-condition');
            });

            test('keeps the id of a hint when an edited exercise is saved', async ({ page }) => {
                const state = await open(page, ADMIN, `/admin/code-review/${LOGIN}/edit`);
                await page.getByLabel(/^Hint 1 text/).fill('Look at how the query is put together.');
                await page.getByRole('button', { name: /Add a hint/ }).click();
                await page.getByLabel(/^Hint 3 text/).fill('A hint with no id yet.');
                await page.getByTestId('save-snippet').click();
                // The exercise was solved, so the change is held back until it is confirmed
                await page.getByRole('dialog').getByRole('button', { name: 'Save the change' }).click();
                await expect(page).toHaveURL(/\/admin\/code-review$/);
                const puts = state.calls.filter((c) => c.method === 'PUT');
                const hints = (puts.at(-1)?.body as { hints: { id?: string }[] }).hints;
                expect(hints[0].id).toBe('hint-login-1');
                expect(hints[1].id).toBe('hint-login-2');
                expect(hints[2].id).toBeUndefined();
            });

            test('asks before changing the key of an exercise members solved, with the numbers, then resends with the confirmation', async ({ page }) => {
                const state = await open(page, ADMIN, `/admin/code-review/${LOGIN}/edit`);
                await page.getByTestId('finding-row').nth(1).getByRole('button', { name: /^Remove finding 2/ }).click();
                await page.getByTestId('save-snippet').click();
                const dialog = page.getByRole('dialog');
                await expect(dialog).toContainText('2 members have solved this exercise');
                await expect(dialog).toContainText('findings go from 2 to 1');
                expect(state.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
                await dialog.getByRole('button', { name: 'Keep editing' }).click();
                await expect(page).toHaveURL(/\/edit$/);
                await page.getByTestId('save-snippet').click();
                await page.getByRole('dialog').getByRole('button', { name: 'Save the change' }).click();
                await expect(page).toHaveURL(/\/admin\/code-review$/);
                const puts = state.calls.filter((c) => c.method === 'PUT');
                expect(puts).toHaveLength(3);
                expect(puts[0].body).not.toHaveProperty('confirmKeyChange');
                expect(puts.at(-1)?.body).toMatchObject({ confirmKeyChange: true });
            });

            test('a title change on a solved exercise is saved without a question', async ({ page }) => {
                const state = await open(page, ADMIN, `/admin/code-review/${LOGIN}/edit`);
                await page.getByLabel(/^Title/).fill('Login check, reworded');
                await page.getByTestId('save-snippet').click();
                await expect(page).toHaveURL(/\/admin\/code-review$/);
                expect(state.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
            });

            test('a refused delete offers to unpublish right in the editor', async ({ page }) => {
                const state = await open(page, ADMIN, `/admin/code-review/${LOGIN}/edit`);
                await page.getByRole('button', { name: /^Delete exercise/ }).click();
                await page.getByRole('dialog').getByRole('button', { name: 'Delete exercise' }).click();
                await expect(page.getByTestId('form-banner')).toContainText(/Unpublish it instead/);
                // the dialog buttons never save the form behind them
                expect(state.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
                await page.getByTestId('unpublish-now').click();
                await expect(page).toHaveURL(/\/admin\/code-review$/);
                expect(posts(state, `/${LOGIN}/unpublish`)).toHaveLength(1);
            });

            test('an exercise that does not exist shows an error, not an empty editor', async ({ page }) => {
                await open(page, ADMIN, '/admin/code-review/nothing-here/edit');
                await expect(page.getByText('This exercise does not exist')).toBeVisible();
                await expect(page.getByTestId('snippet-editor')).toHaveCount(0);
            });
        });
    });
}

test.describe('Code review without findings', () => {
    test('an exercise with no findings cannot be attempted by a member', async ({ page }) => {
        const state = freshState();
        state.snippets.find((s) => s.slug === NO_FINDINGS)!.isPublished = true;
        await open(page, MEMBER, `/code-review/${NO_FINDINGS}`, state);
        await expect(page.getByText(/has no findings to grade yet/)).toBeVisible();
        await expect(page.getByTestId('submit-marks')).toBeDisabled();
    });
});
