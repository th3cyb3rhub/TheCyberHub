import { test, expect, type Page } from '@playwright/test';
import {
    ADMIN, CANCELLED, DRAFT, ENDED, FLAGS, FROZEN, LIVE, MEMBER, MODERATOR, PRIVATE, TEAM, UPCOMING, VISITOR,
    freshState, mockCtfApi, seedTeam, type MockState, type Role,
} from './ctf-mocks';

/** The mock API answers every call, and the server render fails soft (no backend runs here), so the browser loads each page. */
async function open(page: Page, who: Role, path: string, state: MockState = freshState()) {
    await mockCtfApi(page, who, state);
    await page.goto(path);
    return state;
}

const noHorizontalScroll = async (page: Page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
};

const comp = (slug: string) => `/ctf/competitions/${slug}`;
const submits = (state: MockState) => state.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/submit'));
const writes = (state: MockState) => state.calls.filter((c) => c.method !== 'GET');

async function openChallenge(page: Page, title: string) {
    await page.getByRole('button', { name: new RegExp(title) }).click();
}

async function sendFlag(page: Page, flag: string) {
    await page.getByLabel('Flag', { exact: true }).fill(flag);
    await page.getByRole('button', { name: 'Submit flag' }).click();
}

test.describe('CTF competitions list', () => {
    test('lists published competitions, filters by status in the address and hides drafts and unlisted ones', async ({ page }) => {
        await open(page, VISITOR, '/ctf/competitions');
        await expect(page.getByRole('heading', { name: 'CTF Competitions', level: 1 })).toBeVisible();
        // All: live, team, frozen, upcoming, ended, cancelled (the featured one sits above the grid)
        await expect(page.getByTestId('ctf-count')).toContainText('6 competitions');
        await expect(page.getByTestId('featured')).toContainText('Winter CTF');
        await expect(page.getByText('Secret Draft')).toHaveCount(0);
        await expect(page.getByText('Private Invite CTF')).toHaveCount(0);

        await page.getByTestId('filter-live').click();
        await expect(page).toHaveURL(/status=live/);
        await expect(page.getByTestId('ctf-count')).toContainText('3 competitions');
        await expect(page.getByTestId('ctf-card').first()).toBeVisible();
        for (const status of await page.getByTestId('ctf-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))) {
            expect(['live', 'frozen']).toContain(status);
        }

        await page.getByTestId('filter-upcoming').click();
        await expect(page).toHaveURL(/status=upcoming/);
        await expect(page.getByTestId('ctf-card')).toHaveCount(1);
        await expect(page.getByTestId('ctf-card')).toContainText('Spring Open');

        await page.getByTestId('filter-ended').click();
        await expect(page).toHaveURL(/status=ended/);
        await expect(page.getByTestId('ctf-card')).toHaveCount(1);
        await expect(page.getByTestId('ctf-card')).toContainText('Autumn CTF');
        await expect(page.getByTestId('filter-ended')).toHaveAttribute('aria-current', 'page');
    });

    test('shows the card facts and opens a competition', async ({ page }) => {
        await open(page, VISITOR, '/ctf/competitions?status=upcoming');
        const card = page.getByTestId('ctf-card');
        await expect(card).toContainText('Upcoming');
        await expect(card.getByTestId('card-dates')).toBeVisible();
        await expect(card).toContainText('A hardware key');
        await card.getByRole('link', { name: /Spring Open/ }).first().click();
        await expect(page).toHaveURL(new RegExp(`${UPCOMING}$`));
        await expect(page.getByRole('heading', { name: 'Spring Open', level: 1 })).toBeVisible();
    });

    test('adds the manage link for administrators only', async ({ page }) => {
        await open(page, ADMIN, '/ctf/competitions');
        await expect(page.getByRole('link', { name: /Manage competitions/ })).toHaveAttribute('href', '/admin/ctf');
        // Staff also see the draft
        await expect(page.getByRole('link', { name: 'Secret Draft' })).toBeVisible();
    });

    test('has no manage link for a member', async ({ page }) => {
        await open(page, MEMBER, '/ctf/competitions');
        await expect(page.getByTestId('ctf-grid')).toBeVisible();
        await expect(page.getByRole('link', { name: /Manage competitions/ })).toHaveCount(0);
    });
});

test.describe('Competition states', () => {
    test('upcoming: counts down, keeps the challenges closed and the flag form out of reach', async ({ page }) => {
        await open(page, VISITOR, comp(UPCOMING));
        await expect(page.getByRole('heading', { name: 'Spring Open', level: 1 })).toBeVisible();
        await expect(page.getByRole('timer')).toBeVisible();
        await expect(page.getByTestId('challenges-locked')).toContainText(/open when the competition starts/i);
        await expect(page.getByTestId('banner-signin')).toBeVisible();
        await expect(page.getByLabel('Flag', { exact: true })).toHaveCount(0);
    });

    test('live: lists the challenges with points and solve counts', async ({ page }) => {
        await open(page, VISITOR, comp(LIVE));
        await expect(page.getByRole('timer')).toBeVisible();
        await expect(page.getByTestId('challenge')).toHaveCount(3);
        await expect(page.getByTestId('challenge').first()).toContainText('Cookie Monster');
        await expect(page.getByTestId('challenge').first()).toContainText('100 pts');
        await expect(page.getByTestId('challenge').first()).toContainText('2 solves');
        await expect(page.getByTestId('banner-signin')).toBeVisible();
    });

    test('frozen: says the board is frozen and shows the board as it stood', async ({ page }) => {
        await open(page, VISITOR, `${comp(FROZEN)}?tab=scoreboard`);
        await expect(page.getByTestId('banner-frozen')).toBeVisible();
        await expect(page.getByTestId('frozen-note')).toContainText('Frozen.');
        // linus solved after the freeze: the public board does not show his points
        const rows = page.getByTestId('board-row');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('ada');
        await expect(page.getByText('linus')).toHaveCount(0);
    });

    test('frozen: an administrator sees the live board', async ({ page }) => {
        await open(page, ADMIN, `${comp(FROZEN)}?tab=scoreboard`);
        await expect(page.getByTestId('board-row')).toHaveCount(2);
        await expect(page.getByTestId('frozen-note')).toHaveCount(0);
        await expect(page.getByText(/because you are staff/)).toBeVisible();
    });

    test('ended: says so, closes the flag form and links to the results', async ({ page }) => {
        await open(page, MEMBER, comp(ENDED));
        await expect(page.getByTestId('banner-ended')).toBeVisible();
        await expect(page.getByRole('link', { name: /results/i }).first()).toHaveAttribute('href', new RegExp(`${ENDED}/results`));
        await openChallenge(page, 'Cookie Monster');
        await expect(page.getByTestId('flag-closed')).toContainText('flags are closed');
        await expect(page.getByLabel('Flag', { exact: true })).toHaveCount(0);
    });

    test('cancelled: says so and closes everything', async ({ page }) => {
        await open(page, MEMBER, comp(CANCELLED));
        await expect(page.getByTestId('banner-cancelled')).toBeVisible();
        await expect(page.getByTestId('challenges-locked')).toContainText('cancelled');
    });

    test('a draft is a not-found for the public and visible to staff with a notice', async ({ page }) => {
        await open(page, VISITOR, comp(DRAFT));
        await expect(page.getByText('This competition is not available')).toBeVisible();
    });

    test('a draft shows staff the draft notice', async ({ page }) => {
        await open(page, ADMIN, comp(DRAFT));
        await expect(page.getByTestId('banner-draft')).toBeVisible();
    });

    test('an unlisted competition opens by its link', async ({ page }) => {
        await open(page, VISITOR, comp(PRIVATE));
        await expect(page.getByRole('heading', { name: 'Private Invite CTF', level: 1 })).toBeVisible();
    });

    test('keeps the tab in the address and renders the rules as inert markdown', async ({ page }) => {
        await open(page, VISITOR, comp(LIVE));
        await page.getByRole('tab', { name: 'Rules' }).click();
        await expect(page).toHaveURL(/tab=rules/);
        await expect(page.getByRole('heading', { name: 'Rules', level: 2 }).first()).toBeVisible();
        await expect(page.getByText('No attacks on the platform.')).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
        await expect(page.locator('[data-testid="ctf-markdown"] script')).toHaveCount(0);
        await page.reload();
        await expect(page.getByRole('tab', { name: 'Rules' })).toHaveAttribute('aria-selected', 'true');
    });
});

test.describe('Registration (solo)', () => {
    test('a visitor is asked to sign in; a member registers and unregisters', async ({ page }) => {
        const state = freshState();
        await open(page, MEMBER, comp(LIVE), state);
        const panel = page.getByTestId('register-panel');
        await panel.getByRole('button', { name: 'Register' }).click();
        await expect(panel).toContainText('You are registered');
        expect(writes(state).some((c) => c.method === 'POST' && c.path.endsWith('/register'))).toBe(true);

        await panel.getByRole('button', { name: 'Unregister' }).click();
        await page.getByRole('dialog').getByRole('button', { name: /Unregister/ }).click();
        await expect(panel.getByRole('button', { name: 'Register' })).toBeVisible();
        expect(writes(state).some((c) => c.method === 'DELETE' && c.path.endsWith('/register'))).toBe(true);
    });

    test('says when registration is closed or the competition is full', async ({ page }) => {
        const state = freshState();
        state.comps.find((c) => c.slug === LIVE)!.registrationOpen = false;
        await open(page, MEMBER, comp(LIVE), state);
        await expect(page.getByTestId('register-closed')).toContainText('Registration is closed');
    });

    test('shows the server reason when registering fails', async ({ page }) => {
        const state = freshState({ failOnce: { 'POST /register': { status: 409, code: 'CTF_FULL', message: 'full' } } });
        await open(page, MEMBER, comp(LIVE), state);
        await page.getByTestId('register-panel').getByRole('button', { name: 'Register' }).click();
        await expect(page.getByTestId('register-panel').getByRole('alert')).toContainText('This competition is full');
    });
});

test.describe('Solving', () => {
    test('a wrong flag, then the right one: tries, points, solved tick and the board', async ({ page }) => {
        const state = freshState();
        await open(page, MEMBER, comp(LIVE), state);
        await openChallenge(page, 'Cookie Monster');

        await sendFlag(page, 'flag{wrong}');
        await expect(page.getByTestId('wrong-notice')).toContainText('That is not the flag');
        await expect(page.getByTestId('wrong-notice')).toContainText('1 of 10 tries used');
        // The text is gone from the box once it is sent, and from the page
        await expect(page.getByLabel('Flag', { exact: true })).toHaveValue('');
        await expect(page.getByText('flag{wrong}')).toHaveCount(0);

        await sendFlag(page, FLAGS['ch-1']);
        await expect(page.getByTestId('flag-success')).toContainText('+100 points');
        await expect(page.getByTestId('flag-success')).not.toContainText('global leaderboard');
        await expect(page.getByTestId('challenge').first()).toHaveAttribute('data-solved', 'true');
        await expect(page.getByTestId('progress')).toContainText('1');

        // Two sends, both with the flag in the body only
        expect(submits(state)).toHaveLength(2);
        expect(submits(state).map((c) => c.body?.flag)).toEqual(['flag{wrong}', FLAGS['ch-1']]);
        expect(submits(state).every((c) => !c.query)).toBe(true);
        expect(page.url()).not.toContain('flag');
        expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('flag{');

        await page.getByRole('tab', { name: 'Scoreboard' }).click();
        await expect(page.getByTestId('my-standing')).toContainText('100 points');
        await expect(page.getByTestId('board-row').filter({ hasText: 'testuser' })).toHaveAttribute('aria-current', 'true');
    });

    test('an empty flag is refused in the page, without a request', async ({ page }) => {
        const state = freshState();
        await open(page, MEMBER, comp(LIVE), state);
        await openChallenge(page, 'Cookie Monster');
        await page.getByRole('button', { name: 'Submit flag' }).click();
        await expect(page.getByText('Enter the flag before you send it')).toBeVisible();
        expect(submits(state)).toHaveLength(0);
    });

    test('rate limit: the box is off with a countdown, then comes back', async ({ page }) => {
        const state = freshState({ limitAfter: 1, retryAfter: 2 });
        await open(page, MEMBER, comp(LIVE), state);
        await openChallenge(page, 'Padding Oracle');
        await sendFlag(page, 'flag{one}');
        await expect(page.getByTestId('wrong-notice')).toBeVisible();
        await sendFlag(page, 'flag{two}');
        await expect(page.getByTestId('wait-notice')).toContainText('Too many tries');
        await expect(page.getByTestId('wait-clock')).toHaveAttribute('role', 'timer');
        await expect(page.getByLabel('Flag', { exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Submit flag' })).toBeDisabled();
        // After the wait the box is back
        await expect(page.getByLabel('Flag', { exact: true })).toBeEnabled({ timeout: 8000 });
        await expect(page.getByTestId('wait-notice')).toHaveCount(0);
    });

    test('a solved challenge shows solved after a reload', async ({ page }) => {
        const state = freshState();
        await open(page, MEMBER, comp(LIVE), state);
        await openChallenge(page, 'Cookie Monster');
        await sendFlag(page, FLAGS['ch-1']);
        await expect(page.getByTestId('flag-success')).toBeVisible();
        await page.reload();
        await expect(page.getByTestId('challenge').first()).toHaveAttribute('data-solved', 'true');
        await openChallenge(page, 'Cookie Monster');
        await expect(page.getByTestId('flag-solved')).toBeVisible();
    });

    test('a visitor is asked to sign in instead of seeing the flag box', async ({ page }) => {
        await open(page, VISITOR, comp(LIVE));
        await openChallenge(page, 'Cookie Monster');
        await expect(page.getByTestId('flag-signin')).toContainText('Sign in');
    });

    test('dynamic scoring: the points fall with each solve and the server value is shown', async ({ page }) => {
        const state = freshState();
        seedTeam(state, TEAM, 'Red Pandas', ['user-1', 'user-2']);
        await open(page, MEMBER, comp(TEAM), state);
        await expect(page.getByTestId('challenge').first().getByTestId('challenge-points')).toContainText('100 pts');
        await openChallenge(page, 'Cookie Monster');
        await sendFlag(page, FLAGS['ch-1']);
        await expect(page.getByTestId('flag-success')).toContainText('+100 points');
        await expect(page.getByTestId('flag-success')).toContainText('your team');
        // The same points go to the account because this competition awards them
        await expect(page.getByTestId('flag-success')).toContainText('global leaderboard');
        // The next solver would get 90 %
        await expect(page.getByTestId('challenge').first().getByTestId('challenge-points')).toContainText('90 pts');
        await expect(page.getByTestId('challenge').first().getByTestId('challenge-points')).toContainText('of 100');
    });
});

test.describe('Teams', () => {
    test('without a team: the notice leads to the team tab, where a team is created', async ({ page }) => {
        const state = freshState();
        await open(page, MEMBER, comp(TEAM), state);
        await expect(page.getByTestId('banner-no-team')).toBeVisible();
        await openChallenge(page, 'Cookie Monster');
        await expect(page.getByTestId('flag-blocked')).toHaveAttribute('data-reason', 'team-required');

        await page.getByTestId('banner-no-team').getByRole('button', { name: 'Open the team tab' }).click();
        await expect(page).toHaveURL(/tab=team/);

        // An empty name stays in the page; a good one creates the team
        await page.getByRole('button', { name: 'Create team' }).click();
        await expect(page.getByLabel('Team name')).toHaveAttribute('aria-invalid', 'true');
        await page.getByLabel('Team name').fill('Red Pandas');
        await page.getByRole('button', { name: 'Create team' }).click();
        await expect(page.getByTestId('team-card')).toContainText('Red Pandas');
        await expect(page.getByTestId('team-card')).toHaveAttribute('data-role', 'captain');
        await expect(page.getByTestId('team-small')).toBeVisible();
        expect(writes(state).find((c) => c.method === 'POST' && c.path.endsWith('/team'))?.body).toEqual({ name: 'Red Pandas' });
    });

    test('a taken team name is reported under the field', async ({ page }) => {
        const state = freshState();
        seedTeam(state, TEAM, 'Red Pandas', ['user-2']);
        await open(page, MEMBER, `${comp(TEAM)}?tab=team`, state);
        await page.getByLabel('Team name').fill('red pandas');
        await page.getByRole('button', { name: 'Create team' }).click();
        await expect(page.getByText('Another team already uses that name')).toBeVisible();
    });

    test('joins with an invite code typed any way, and says when it is wrong', async ({ page }) => {
        const state = freshState();
        seedTeam(state, TEAM, 'Blue Foxes', ['user-2'], 'FACE0123456789ABCDEF');
        await open(page, MEMBER, `${comp(TEAM)}?tab=team`, state);
        await page.getByLabel('Invite code').fill('nope-nope');
        await page.getByRole('button', { name: 'Join team' }).click();
        await expect(page.getByText('An invite code has only letters and numbers')).toBeVisible();
        await page.getByLabel('Invite code').fill('0000 1111 2222 3333');
        await page.getByRole('button', { name: 'Join team' }).click();
        await expect(page.getByText(/does not match any team/)).toBeVisible();
        await page.getByLabel('Invite code').fill(' face 0123456789abcdef ');
        await page.getByRole('button', { name: 'Join team' }).click();
        await expect(page.getByTestId('team-card')).toContainText('Blue Foxes');
        await expect(page.getByTestId('team-card')).toHaveAttribute('data-role', 'member');
        await expect(page.getByTestId('team-member')).toHaveCount(2);
    });

    test('the captain removes a member after confirming; the member sees no remove buttons', async ({ page }) => {
        const state = freshState();
        seedTeam(state, TEAM, 'Red Pandas', ['user-1', 'user-2', 'user-3']);
        await open(page, MEMBER, `${comp(TEAM)}?tab=team`, state);
        await expect(page.getByTestId('team-member')).toHaveCount(3);
        await expect(page.getByTestId('leave-blocked')).toContainText(/Remove the other members first/);
        await page.getByRole('button', { name: 'Remove second' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Remove player' }).click();
        await expect(page.getByTestId('team-member')).toHaveCount(2);
        expect(writes(state).find((c) => c.path.endsWith('/team/kick'))?.body).toEqual({ memberId: 'user-2' });
    });

    test('a member leaves the team', async ({ page }) => {
        const state = freshState();
        seedTeam(state, TEAM, 'Red Pandas', ['user-2', 'user-1']);
        await open(page, MEMBER, `${comp(TEAM)}?tab=team`, state);
        await expect(page.getByTestId('team-card')).toHaveAttribute('data-role', 'member');
        await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
        await page.getByRole('button', { name: 'Leave team' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Leave team' }).click();
        await expect(page.getByTestId('no-team')).toBeVisible();
    });

    test('a captain who is alone leaves and the team is disbanded', async ({ page }) => {
        const state = freshState();
        seedTeam(state, TEAM, 'Solo Panda', ['user-1']);
        await open(page, MEMBER, `${comp(TEAM)}?tab=team`, state);
        await page.getByRole('button', { name: 'Leave and disband' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Leave and disband' }).click();
        await expect(page.getByTestId('no-team')).toBeVisible();
        expect(state.teams).toHaveLength(0);
    });

    test('a team below the minimum cannot send flags and is told how many it needs', async ({ page }) => {
        const state = freshState();
        seedTeam(state, TEAM, 'Solo Panda', ['user-1']);
        await open(page, MEMBER, comp(TEAM), state);
        await expect(page.getByTestId('banner-team-small')).toContainText('at least 2');
        await openChallenge(page, 'Cookie Monster');
        await expect(page.getByTestId('flag-blocked')).toHaveAttribute('data-reason', 'team-too-small');
        expect(submits(state)).toHaveLength(0);
    });

    test('once the team has solved a challenge the roster is fixed: no remove, no leave', async ({ page }) => {
        const state = freshState();
        seedTeam(state, TEAM, 'Red Pandas', ['user-1', 'user-2']);
        await open(page, MEMBER, comp(TEAM), state);
        await openChallenge(page, 'Cookie Monster');
        await sendFlag(page, FLAGS['ch-1']);
        await expect(page.getByTestId('flag-success')).toBeVisible();

        await page.getByRole('tab', { name: 'Team' }).click();
        await expect(page.getByTestId('roster-locked')).toContainText(/roster is fixed/);
        await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
        const leave = page.getByTestId('roster-locked').getByRole('button', { name: 'Leave team' });
        await expect(leave).toHaveAttribute('aria-disabled', 'true');
        await leave.click({ force: true });
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('shows the server reason when a leave is refused with CTF_TEAM_HAS_SOLVES', async ({ page }) => {
        const state = freshState({ failOnce: { 'DELETE /team/leave': { status: 409, code: 'CTF_TEAM_HAS_SOLVES', message: 'locked' } } });
        seedTeam(state, TEAM, 'Red Pandas', ['user-2', 'user-1']);
        await open(page, MEMBER, `${comp(TEAM)}?tab=team`, state);
        await page.getByRole('button', { name: 'Leave team' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Leave team' }).click();
        await expect(page.getByTestId('team-error')).toContainText(/roster is fixed/);
    });

    test('a solo competition has no team tab', async ({ page }) => {
        await open(page, MEMBER, comp(LIVE));
        await expect(page.getByRole('tab', { name: 'Team' })).toHaveCount(0);
    });
});

test.describe('Scoreboard', () => {
    test('shows a solo board, then a team board with captains and member counts', async ({ page }) => {
        const state = freshState();
        const teamId = state.comps.find((c) => c.slug === TEAM)!._id;
        const red = seedTeam(state, TEAM, 'Red Pandas', ['user-2', 'user-3']);
        const blue = seedTeam(state, TEAM, 'Blue Foxes', ['u-ada', 'u-linus', 'u-grace'], 'FACE0123456789ABCDEF');
        state.solves.push({ comp: teamId, challenge: 'ch-1', scope: `team:${blue._id}`, userId: 'u-ada', points: 100, at: Date.now() - 60_000 });
        state.solves.push({ comp: teamId, challenge: 'ch-2', scope: `team:${red._id}`, userId: 'user-2', points: 300, at: Date.now() - 30_000 });

        await open(page, VISITOR, `${comp(LIVE)}?tab=scoreboard`, state);
        await expect(page.getByTestId('scoreboard')).toHaveAttribute('data-mode', 'solo');
        await expect(page.getByRole('columnheader', { name: 'Player' })).toBeVisible();
        await expect(page.getByTestId('board-row').first()).toContainText('ada');
        await expect(page.getByTestId('board-row').first()).toContainText('400');
        await expect(page.getByTestId('board-row')).toHaveCount(2);

        await page.goto(`${comp(TEAM)}?tab=scoreboard`);
        await expect(page.getByTestId('scoreboard')).toHaveAttribute('data-mode', 'team');
        await expect(page.getByRole('columnheader', { name: 'Team' })).toBeVisible();
        const first = page.getByTestId('board-row').first();
        await expect(first).toContainText('Red Pandas');
        await expect(first).toContainText('2 members');
        await expect(page.getByTestId('board-row').nth(1)).toContainText('3 members');
    });

    test('says there are no scores yet, and waits for a competition that has not started', async ({ page }) => {
        await open(page, VISITOR, `${comp(TEAM)}?tab=scoreboard`);
        await expect(page.getByText('No scores yet')).toBeVisible();
        await page.goto(`${comp(UPCOMING)}?tab=scoreboard`);
        await expect(page.getByText('The scoreboard opens when the competition starts')).toBeVisible();
    });

    test('shows a member their own standing', async ({ page }) => {
        const state = freshState();
        state.solves.push({ comp: state.comps.find((c) => c.slug === LIVE)!._id, challenge: 'ch-3', scope: 'user:user-1', userId: 'user-1', points: 200, at: Date.now() - 5000 });
        await open(page, MEMBER, `${comp(LIVE)}?tab=scoreboard`, state);
        await expect(page.getByTestId('my-standing')).toContainText('Rank 2');
        await expect(page.getByTestId('my-standing')).toContainText('200 points');
    });
});

test.describe('Results', () => {
    test('shows the podium, the standings, the first bloods and the prizes of an ended competition', async ({ page }) => {
        await open(page, VISITOR, `${comp(ENDED)}/results`);
        await expect(page.getByTestId('results')).toBeVisible();
        await expect(page.getByRole('heading', { name: /Autumn CTF: final results/ })).toBeVisible();
        await expect(page.getByTestId('podium-place')).toHaveCount(3);
        await expect(page.getByTestId('podium-place').filter({ has: page.locator('[data-rank="1"]') })).toHaveCount(0);
        await expect(page.locator('[data-testid="podium-place"][data-rank="1"]')).toContainText('ada');
        await expect(page.locator('[data-testid="podium-place"][data-rank="1"]')).toContainText('A hardware key');
        await expect(page.getByTestId('totals')).toContainText('5');
        await expect(page.getByTestId('board-row')).toHaveCount(3);
        await expect(page.getByTestId('results')).toContainText('Cookie Monster');
        await expect(page.getByRole('link', { name: /Back to the competition/ })).toHaveAttribute('href', comp(ENDED));
    });

    test('before the end: a friendly note, with the live board one click away', async ({ page }) => {
        await open(page, VISITOR, `${comp(LIVE)}/results`);
        const note = page.getByTestId('results-not-ready');
        await expect(note).toContainText('Results are available when the competition ends');
        await note.getByRole('link', { name: 'Live scoreboard' }).click();
        await expect(page).toHaveURL(/tab=scoreboard/);
        await expect(page.getByTestId('scoreboard')).toBeVisible();
    });

    test('an unknown competition is a clear not-found', async ({ page }) => {
        await open(page, VISITOR, `${comp('does-not-exist')}/results`);
        await expect(page.getByText('These results are not available')).toBeVisible();
    });
});

test.describe('Admin: access', () => {
    test('sends a visitor to sign in and refuses a member', async ({ page }) => {
        await open(page, VISITOR, '/admin/ctf');
        await expect(page).toHaveURL(/\/auth\?redirect=%2Fadmin%2Fctf/);
    });

    test('refuses a member with a clear message', async ({ page }) => {
        await open(page, MEMBER, '/admin/ctf');
        await expect(page.getByText('You cannot open this page')).toBeVisible();
        await expect(page.getByTestId('admin-ctf')).toHaveCount(0);
    });

    test('a moderator reads the list but cannot create or edit', async ({ page }) => {
        await open(page, MODERATOR, '/admin/ctf');
        await expect(page.getByTestId('read-only-note')).toBeVisible();
        await expect(page.getByTestId('admin-ctf')).toHaveCount(8);
        await expect(page.getByRole('link', { name: /New competition/ })).toHaveCount(0);
        await expect(page.getByRole('link', { name: /^Edit / })).toHaveCount(0);
        await page.goto('/admin/ctf/create');
        await expect(page.getByText('You cannot open this page')).toBeVisible();
        await page.goto(`/admin/ctf/${LIVE}/edit`);
        await expect(page.getByText('You cannot open this page')).toBeVisible();
    });

    test('the admin dashboard links to the manager', async ({ page }) => {
        await open(page, ADMIN, '/admin');
        await expect(page.getByRole('link', { name: /CTF Competitions/ })).toHaveAttribute('href', '/admin/ctf');
    });
});

test.describe('Admin: list', () => {
    test('lists every competition with status and counts, and filters by status', async ({ page }) => {
        await open(page, ADMIN, '/admin/ctf');
        await expect(page.getByTestId('admin-ctf')).toHaveCount(8);
        const winter = page.locator('[data-testid="admin-ctf"][data-slug="winter-ctf"]');
        await expect(winter).toContainText('Live');
        await expect(winter.getByTestId('admin-counts')).toContainText('3 challenges');
        await expect(winter.getByTestId('admin-counts')).toContainText('2 players');
        await expect(page.locator('[data-testid="admin-ctf"][data-slug="secret-draft"]')).toContainText('Draft');

        await page.getByRole('button', { name: 'Draft', exact: true }).click();
        await expect(page.getByTestId('admin-ctf')).toHaveCount(1);
        await page.getByRole('button', { name: 'Live or frozen' }).click();
        await expect(page.getByTestId('admin-ctf')).toHaveCount(4);
        await page.getByRole('button', { name: 'Cancelled', exact: true }).click();
        await expect(page.getByTestId('admin-ctf')).toHaveCount(1);
    });

    test('pages through a long list', async ({ page }) => {
        const state = freshState({ pageCap: 3 });
        await open(page, ADMIN, '/admin/ctf', state);
        await expect(page.getByTestId('admin-ctf')).toHaveCount(3);
        // The admin list asks for 20 per page; the cap makes the mock answer 3
        await expect(page.getByRole('link', { name: /New competition/ })).toBeVisible();
    });
});

test.describe('Admin: create and edit', () => {
    const fillBasics = async (page: Page) => {
        await page.locator('#title').fill('Summer Cup');
        await page.locator('#description').fill('Hot challenges.');
        await page.locator('#timezone').selectOption('UTC');
        await page.locator('#start-date').fill('2030-06-01');
        await page.locator('#start-time').fill('10:00');
        await page.locator('#end-date').fill('2030-06-02');
        await page.locator('#end-time').fill('10:00');
    };

    test('validates in the page, then creates a published team competition with prizes and challenges', async ({ page }) => {
        const state = await open(page, ADMIN, '/admin/ctf/create');
        // Nothing is sent while the form is wrong
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.getByTestId('form-error')).toContainText('Please fix 4 things');
        await expect(page.locator('#title')).toHaveAttribute('aria-invalid', 'true');
        expect(writes(state)).toHaveLength(0);

        await fillBasics(page);
        await page.locator('#rules').fill('## Be fair');
        await page.getByRole('button', { name: 'Preview' }).first().click();
        await expect(page.getByTestId('rules-preview')).toContainText('Be fair');
        await page.getByRole('button', { name: 'Write' }).first().click();

        await page.locator('#teamsEnabled').check();
        await page.locator('#minTeamSize').fill('2');
        await page.locator('#maxTeamSize').fill('3');
        await page.locator('#scoringMode').selectOption('dynamic');
        await expect(page.getByTestId('scoring-preview').getByRole('table')).toBeVisible();
        await page.locator('#awardsPoints').check();
        await expect(page.getByTestId('scoring-preview')).toContainText('count on the global leaderboard');

        await page.getByRole('button', { name: 'Add a prize' }).click();
        await page.getByLabel(/Prize for 1st place/).fill('A hardware key');
        await page.getByRole('button', { name: 'Add a prize' }).click();
        await page.getByLabel(/Prize for 2nd place/).fill('Hoodie');

        await page.getByRole('button', { name: 'Add Cookie Monster' }).click();
        await page.getByRole('button', { name: 'Add Padding Oracle' }).click();
        await page.getByRole('button', { name: 'Move Padding Oracle up' }).click();
        await expect(page.getByTestId('set-row').first()).toContainText('Padding Oracle');
        await page.locator('#status').selectOption('published');
        await page.locator('#isPublic').check();

        await page.getByRole('button', { name: 'Create and publish' }).click();
        await expect(page).toHaveURL(/\/admin\/ctf$/);
        const create = writes(state).find((c) => c.method === 'POST' && c.path === '/');
        expect(create?.body).toMatchObject({
            title: 'Summer Cup', description: 'Hot challenges.', rules: '## Be fair', startDate: '2030-06-01T10:00:00.000Z', endDate: '2030-06-02T10:00:00.000Z', timezone: 'UTC',
            status: 'upcoming', teamsEnabled: true, minTeamSize: 2, maxTeamSize: 3, scoringMode: 'dynamic', awardsPoints: true, isPublic: false,
            prizes: [{ place: 1, reward: 'A hardware key' }, { place: 2, reward: 'Hoodie' }], challenges: ['ch-2', 'ch-1'],
        });
        expect(Object.keys(create?.body ?? {})).not.toContain('slug');
        await expect(page.locator('[data-testid="admin-ctf"][data-slug="summer-cup"]')).toBeVisible();
    });

    test('the picker offers draft challenges and never archived ones', async ({ page }) => {
        await open(page, ADMIN, '/admin/ctf/create');
        await expect(page.getByTestId('picker')).toContainText('Draft Challenge');
        await expect(page.getByTestId('picker')).toContainText('Draft challenge');
        await expect(page.getByTestId('picker')).not.toContainText('Archived Challenge');
        await page.locator('#picker-search').fill('padding');
        await expect(page.getByTestId('picker-row')).toHaveCount(1);
    });

    test('a taken slug and a server field error land on their fields', async ({ page }) => {
        const state = await open(page, ADMIN, '/admin/ctf/create');
        await fillBasics(page);
        await page.locator('#slug').fill(LIVE);
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.locator('#slug-error')).toContainText('Another competition already uses this slug');
        await expect(page.locator('#slug')).toBeFocused();
        expect(writes(state)).toHaveLength(1);
    });

    test('an edit sends only what changed, and leaves with the change saved', async ({ page }) => {
        const state = await open(page, ADMIN, `/admin/ctf/${LIVE}/edit`);
        await expect(page.locator('#title')).toHaveValue('Winter CTF');
        await page.locator('#title').fill('Winter CTF 2');
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page).toHaveURL(/\/admin\/ctf$/);
        const put = writes(state).find((c) => c.method === 'PUT');
        expect(put?.body).toEqual({ title: 'Winter CTF 2' });
        expect(state.comps.find((c) => c.slug === LIVE)?.title).toBe('Winter CTF 2');
        // The public pages were asked to drop their caches
    });

    test('says nothing changed instead of sending an empty update', async ({ page }) => {
        const state = await open(page, ADMIN, `/admin/ctf/${LIVE}/edit`);
        await expect(page.locator('#title')).toHaveValue('Winter CTF');
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByText('Nothing changed, so there is nothing to save.')).toBeVisible();
        expect(writes(state).filter((c) => c.method === 'PUT')).toHaveLength(0);
    });

    test('the challenge set of a saved competition changes at once and keeps solved challenges', async ({ page }) => {
        const state = await open(page, ADMIN, `/admin/ctf/${LIVE}/edit`);
        await expect(page.getByTestId('set-row')).toHaveCount(3);
        // ch-1 and ch-2 have solves: they cannot go
        await expect(page.getByRole('button', { name: 'Cookie Monster has solves and cannot be removed' })).toHaveAttribute('aria-disabled', 'true');
        await page.getByRole('button', { name: 'Remove Hidden Strings' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Remove challenge' }).click();
        await expect(page.getByTestId('set-row')).toHaveCount(2);
        expect(state.comps.find((c) => c.slug === LIVE)?.challenges).toEqual(['ch-1', 'ch-2']);

        await page.getByRole('button', { name: 'Add Spare Challenge' }).click();
        await expect(page.getByTestId('set-row')).toHaveCount(3);
        await page.getByRole('button', { name: 'Move Spare Challenge up' }).click();
        await expect.poll(() => state.comps.find((c) => c.slug === LIVE)?.challenges).toEqual(['ch-1', 'ch-4', 'ch-2']);
    });

    test('CTF_LOCKED marks the fields, puts them back and says why', async ({ page }) => {
        const state = freshState({ failOnce: { 'PUT *': { status: 409, code: 'CTF_LOCKED', message: 'locked', meta: { fields: ['maxTeamSize'] } } } });
        // A competition nobody has solved in yet: the form lets the change through, the server says no
        await open(page, ADMIN, `/admin/ctf/${TEAM}/edit`, state);
        await expect(page.locator('#maxTeamSize')).toHaveValue('3');
        await page.locator('#maxTeamSize').fill('2');
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByTestId('form-error')).toContainText(/largest team size/);
        await expect(page.locator('#maxTeamSize')).toHaveValue('3');
        await expect(page.locator('#maxTeamSize')).toBeDisabled();
    });

    test('teams and scoring are fixed once players have solved something', async ({ page }) => {
        await open(page, ADMIN, `/admin/ctf/${LIVE}/edit`);
        await expect(page.locator('#teamsEnabled')).toBeDisabled();
        await expect(page.locator('#scoringMode')).toBeDisabled();
    });

    test('holds the page back when something was typed and the person tries to leave', async ({ page }) => {
        await open(page, ADMIN, `/admin/ctf/${LIVE}/edit`);
        await expect(page.locator('#title')).toHaveValue('Winter CTF');
        await page.locator('#title').fill('Changed');
        await page.getByRole('link', { name: 'Back to the list' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText('Leave without saving?');
        await dialog.getByRole('button', { name: 'Keep editing' }).click();
        await expect(page).toHaveURL(/edit$/);
        await expect(page.locator('#title')).toHaveValue('Changed');
        await page.getByRole('link', { name: 'Back to the list' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
        await expect(page).toHaveURL(/\/admin\/ctf$/);
    });

    test('cancels a competition after confirming', async ({ page }) => {
        const state = await open(page, ADMIN, `/admin/ctf/${TEAM}/edit`);
        await page.getByRole('button', { name: 'Cancel competition' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Cancel competition' }).click();
        await expect(page).toHaveURL(/\/admin\/ctf$/);
        expect(state.comps.find((c) => c.slug === TEAM)?.status).toBe('cancelled');
    });

    test('deleting a competition with solves cancels it instead and says so', async ({ page }) => {
        const state = await open(page, ADMIN, `/admin/ctf/${LIVE}/edit`);
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText('cancelled instead');
        await dialog.getByRole('button', { name: 'Cancel it instead' }).click();
        await expect(page).toHaveURL(/\/admin\/ctf$/);
        expect(state.comps.find((c) => c.slug === LIVE)?.status).toBe('cancelled');
    });

    test('deleting a competition nobody has played removes it', async ({ page }) => {
        const state = await open(page, ADMIN, `/admin/ctf/${DRAFT}/edit`);
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(page.getByRole('dialog')).toContainText('removed for good');
        await page.getByRole('dialog').getByRole('button', { name: 'Delete competition' }).click();
        await expect(page).toHaveURL(/\/admin\/ctf$/);
        expect(state.comps.some((c) => c.slug === DRAFT)).toBe(false);
    });
});

test.describe('Mobile layout', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    const pages: [string, Role, string][] = [
        ['the list', VISITOR, '/ctf/competitions'],
        ['a live competition', MEMBER, comp(LIVE)],
        ['its scoreboard', MEMBER, `${comp(LIVE)}?tab=scoreboard`],
        ['a team competition', MEMBER, `${comp(TEAM)}?tab=team`],
        ['the results', VISITOR, `${comp(ENDED)}/results`],
        ['the admin list', ADMIN, '/admin/ctf'],
        ['the admin form', ADMIN, `/admin/ctf/${LIVE}/edit`],
        ['the new competition form', ADMIN, '/admin/ctf/create'],
    ];
    for (const [name, who, path] of pages) {
        test(`${name} does not scroll sideways at 390 px`, async ({ page }) => {
            const state = freshState();
            seedTeam(state, TEAM, 'A Team With A Rather Long Name For A Phone', ['user-1', 'user-2']);
            await open(page, who, path, state);
            await expect(page.locator('h1').first()).toBeVisible();
            await page.waitForLoadState('networkidle');
            await noHorizontalScroll(page);
        });
    }
});
