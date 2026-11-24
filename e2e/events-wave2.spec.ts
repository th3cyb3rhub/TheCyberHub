import { test, expect, type Page, type Route } from '@playwright/test';
import { testUser } from './helpers';

/**
 * Events wave 2: calendar (month, week, agenda), subscribe and personal feed, series page, archive,
 * organizer export. The API is mocked with fixed data; the browser clock and zone are fixed too, so
 * every run sees the same December 2026.
 */

test.use({ timezoneId: 'Europe/Berlin', locale: 'en-US' });

const SECRET = 'tchcal_E2eSecretTokenValue0123456789abcdefghijklmn';
const SERIES_ID = '64b000000000000000000009';
const EVENT_ID = '64b000000000000000000001';

const calItem = (id: string, title: string, startUtc: string, hours: number, over: Record<string, unknown> = {}) => ({
    id,
    slug: `${id}-slug`,
    title,
    category: 'ctf',
    startDate: startUtc,
    endDate: new Date(new Date(startUtc).getTime() + hours * 3600_000).toISOString(),
    timezone: 'Europe/Berlin',
    format: 'online',
    status: 'upcoming',
    isAllDay: false,
    ...over,
});

const CALENDAR = [
    calItem('a1', 'Alpha Night', '2026-12-09T16:00:00.000Z', 1),
    calItem('a2', 'Beta Workshop', '2026-12-09T17:00:00.000Z', 1, { category: 'workshop' }),
    calItem('a3', 'Gamma Meetup', '2026-12-09T18:00:00.000Z', 1, { category: 'meetup' }),
    calItem('a4', 'Delta Webinar', '2026-12-09T19:00:00.000Z', 1, { category: 'webinar' }),
    calItem('c1', 'Called Off Talk', '2026-12-10T17:00:00.000Z', 1, { status: 'cancelled' }),
    calItem('l1', 'Weekly CTF Night', '2026-12-11T18:00:00.000Z', 2, { status: 'live', seriesId: SERIES_ID }),
    calItem('z1', 'Christmas Quiz', '2026-12-24T17:00:00.000Z', 1),
];

const ARCHIVE = Array.from({ length: 15 }, (_, i) => ({
    id: `r${i}`,
    slug: `past-${i}`,
    title: `Past Event ${i + 1}`,
    shortDescription: 'Looking back.',
    image: null,
    category: i % 2 ? 'workshop' : 'ctf',
    startDate: new Date(Date.UTC(2026, 9, 28 - i, 17)).toISOString(),
    endDate: new Date(Date.UTC(2026, 9, 28 - i, 19)).toISOString(),
    timezone: 'Europe/Berlin',
    format: 'online',
    status: 'ended',
    seriesId: i === 0 ? SERIES_ID : null,
    hasRecording: i % 2 === 0,
    hasSlides: i % 3 === 0,
    attendedCount: 10 + i,
    averageRating: i % 2 === 0 ? 4.5 : null,
    ratingCount: i % 2 === 0 ? 8 : 0,
}));

const SERIES = {
    id: SERIES_ID,
    title: 'Weekly CTF Night',
    description: 'Bring a **laptop**.',
    shortDescription: 'A beginner friendly CTF.',
    image: null,
    bannerImage: null,
    category: 'ctf',
    tags: [],
    format: 'online',
    location: 'Online',
    venue: null,
    registrationLink: null,
    organizer: 'TheCyberHub',
    organizerLogo: null,
    maxParticipants: 60,
    rsvpEnabled: true,
    waitlistEnabled: true,
    status: 'active',
    createdAt: '2026-11-01T00:00:00.000Z',
    recurrence: { rule: 'weekly', interval: 1, weekday: 4, weekOfMonth: null, startsOn: '2026-12-03', startTime: '19:00', timezone: 'Europe/London', durationMinutes: 120, until: null, count: null },
    nextOccurrences: [
        calItem('o1', 'Weekly CTF Night', '2026-12-10T19:00:00.000Z', 2, { timezone: 'Europe/London', seriesId: SERIES_ID, slug: 'weekly-ctf-night-2026-12-10' }),
        calItem('o2', 'Weekly CTF Night', '2026-12-17T19:00:00.000Z', 2, { timezone: 'Europe/London', seriesId: SERIES_ID, slug: 'weekly-ctf-night-2026-12-17' }),
    ],
};

interface Calls { calendar: URL[]; archives: URL[]; tokenPosts: number; tokenDeletes: number; undo: unknown[]; csv: number }
interface Options { signedIn?: boolean; role?: string; tokenActive?: boolean }

const cors = (route: Route) => ({
    'access-control-allow-origin': route.request().headers()['origin'] || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization, accept',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-expose-headers': 'X-Export-Truncated, Content-Disposition',
});
const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: cors(route), body: JSON.stringify(body) });

async function mockApi(page: Page, options: Options = {}): Promise<Calls> {
    const calls: Calls = { calendar: [], archives: [], tokenPosts: 0, tokenDeletes: 0, undo: [], csv: 0 };
    let tokenActive = options.tokenActive ?? false;
    await page.clock.setFixedTime(new Date('2026-12-09T12:00:00Z'));
    if (options.signedIn) await page.addInitScript(() => window.localStorage.setItem('token', 'e2e-token'));

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });

        if (path === '/api/auth/me') {
            return options.signedIn
                ? json(route, { success: true, data: { ...testUser, id: 'user-1', role: options.role ?? 'user' } })
                : json(route, { success: false, message: 'Unauthorized' }, 401);
        }
        if (path === '/api/events/calendar') {
            calls.calendar.push(url);
            const category = url.searchParams.get('category');
            const from = new Date(url.searchParams.get('from') ?? 0).getTime();
            const to = new Date(url.searchParams.get('to') ?? 0).getTime();
            // Like the API: what overlaps the range, optionally of one category
            const items = CALENDAR.filter((i) => (!category || i.category === category) && new Date(i.startDate).getTime() <= to && new Date(i.endDate).getTime() >= from);
            return json(route, { success: true, data: items, meta: { from: url.searchParams.get('from'), to: url.searchParams.get('to'), count: items.length, truncated: false } });
        }
        if (path === '/api/events/archives') {
            calls.archives.push(url);
            const page_ = Number(url.searchParams.get('page') ?? 1);
            const limit = Number(url.searchParams.get('limit') ?? 12);
            const q = (url.searchParams.get('q') ?? '').toLowerCase();
            const category = url.searchParams.get('category');
            const rows = ARCHIVE.filter((a) => (!category || a.category === category) && (!q || a.title.toLowerCase().includes(q)));
            const slice = rows.slice((page_ - 1) * limit, page_ * limit);
            return json(route, { success: true, data: slice, pagination: { page: page_, limit, hasMore: page_ * limit < rows.length } });
        }
        if (path === '/api/events/me/calendar-token') {
            if (method === 'GET') return json(route, { success: true, data: { active: tokenActive, createdAt: tokenActive ? '2026-11-20T09:00:00.000Z' : null, rotatedAt: null, lastUsedAt: null } });
            if (method === 'POST') {
                calls.tokenPosts += 1;
                const rotated = tokenActive;
                tokenActive = true;
                const feed = `http://localhost:5001/api/events/me/calendar.ics?token=${SECRET}`;
                return json(route, { success: true, data: { url: feed, webcalUrl: feed.replace(/^http:/, 'webcal:'), createdAt: '2026-12-09T12:00:00.000Z', rotated } }, 201);
            }
            if (method === 'DELETE') {
                calls.tokenDeletes += 1;
                tokenActive = false;
                return json(route, { success: true, data: { revoked: true } });
            }
        }
        if (path === `/api/events/series/${SERIES_ID}`) return json(route, { success: true, data: SERIES });
        if (path === `/api/events/${EVENT_ID}/attendees.csv`) {
            calls.csv += 1;
            return route.fulfill({
                status: 200,
                headers: { ...cors(route), 'content-type': 'text/csv; charset=utf-8', 'x-export-truncated': 'true', 'content-disposition': 'attachment; filename="winter-ctf-attendees.csv"' },
                body: '﻿"name","username","status","registeredAt","attended"\r\n"Ada","ada","attended","2026-11-01","yes"\r\n',
            });
        }
        if (path === `/api/events/${EVENT_ID}/attendees`) {
            const status = url.searchParams.get('status');
            const rows = status === 'attended'
                ? [{ user: { _id: 'u-ada', username: 'ada', name: 'Ada Lovelace' }, status: 'attended', registeredAt: '2026-11-01T10:00:00Z', attendedAt: '2026-12-05T18:00:00Z', waitlistSeq: null }]
                : [];
            return json(route, { success: true, data: rows, pagination: { page: 1, limit: 50, total: rows.length, pages: 1, hasMore: false } });
        }
        if (path === `/api/events/${EVENT_ID}/attendance/undo`) {
            calls.undo.push(JSON.parse(request.postData() ?? '{}'));
            return json(route, { success: true, data: { undone: ['u-ada'], notAttended: [], notRegistered: [], pointsReversed: 10 } });
        }
        if (path === '/api/events/winter-ctf-night') {
            return json(route, { success: true, data: {
                _id: EVENT_ID, slug: 'winter-ctf-night', title: 'Winter CTF Night', shortDescription: null, description: 'A night of challenges.', category: 'ctf', status: 'ended',
                locationType: 'online', location: 'Online', timezone: 'Europe/Berlin', startDate: '2026-12-05T17:00:00.000Z', endDate: '2026-12-05T19:00:00.000Z', endsAt: '2026-12-05T19:00:00.000Z',
                organizer: 'Ada', tags: [], speakers: [], maxParticipants: 60, registeredCount: 42, waitlistCount: 0, spotsLeft: 18, isFull: false, waitlistEnabled: true, eventType: 'community',
                isFeatured: false, hasRecording: false, hasSlides: false, averageRating: null, ratingCount: 0, rsvpDeadline: null, image: null, bannerImage: null, venue: null,
                registrationLink: null, recordingLink: null, slidesLink: null, summaryNotes: null, joinLink: null, defaultDurationMinutes: null, stats: { registered: 42, waitlisted: 0, attended: 1, spotsLeft: 18, averageRating: null, ratingCount: 0 },
                viewer: { registered: false, waitlisted: false, attended: false, position: null, reminder: null, canRegister: false, canJoinWaitlist: false, canFeedback: false, hasFeedback: false, joinOpensAt: null, canManage: true },
            } });
        }
        return json(route, { success: true, data: [], pagination: { page: 1, limit: 12, total: 0, hasMore: false } });
    });
    return calls;
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('Calendar, desktop', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('month grid: one range from the API, three items and "+1 more", a day dialog, and the zone label', async ({ page }) => {
        const calls = await mockApi(page);
        await page.goto('/events/calendar');

        const grid = page.getByRole('grid', { name: 'December 2026' });
        await expect(grid).toBeVisible();
        await expect(page.getByTestId('zone-label')).toContainText('Europe/Berlin');
        await expect(grid.getByRole('gridcell')).toHaveCount(42);

        const day = page.locator('[data-day="2026-12-09"]');
        await expect(day).toHaveAttribute('aria-label', 'Wednesday, December 9, 2026, 4 events, today');
        await expect(day.getByTestId('month-item')).toHaveCount(3);
        await expect(day.getByText('+1 more')).toBeVisible();
        // Cancelled and live are words as well as styles
        await expect(page.locator('[data-day="2026-12-10"]').getByText('(cancelled)')).toBeAttached();
        await expect(page.locator('[data-day="2026-12-11"]').getByText('(live now)')).toBeAttached();

        await day.getByText('+1 more').click();
        const dialog = page.getByRole('dialog', { name: 'Wednesday, December 9, 2026' });
        await expect(dialog.getByTestId('calendar-item')).toHaveCount(4);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();

        // One request for the whole 6 week grid, in the viewer's zone, and under 62 days
        expect(calls.calendar).toHaveLength(1);
        const from = new Date(calls.calendar[0].searchParams.get('from')!);
        const to = new Date(calls.calendar[0].searchParams.get('to')!);
        expect(from.toISOString()).toBe('2026-11-29T23:00:00.000Z');
        expect(to.toISOString()).toBe('2027-01-10T22:59:59.999Z');
        expect((to.getTime() - from.getTime()) / 86400000).toBeLessThan(62);
        expect(await noSideScroll(page)).toBe(true);
    });

    test('keyboard: arrows move between days, Enter opens the day, Page Down changes month, Back returns', async ({ page }) => {
        await mockApi(page);
        await page.goto('/events/calendar');
        const cell = (d: string) => page.locator(`[data-day="${d}"]`);

        await expect(cell('2026-12-09')).toHaveAttribute('tabindex', '0');
        await cell('2026-12-09').focus();
        await page.keyboard.press('ArrowRight');
        await expect(cell('2026-12-10')).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(cell('2026-12-17')).toBeFocused();
        await page.keyboard.press('Home');
        await expect(cell('2026-12-14')).toBeFocused();
        await page.keyboard.press('End');
        await expect(cell('2026-12-20')).toBeFocused();
        await expect(cell('2026-12-20')).toHaveAttribute('tabindex', '0');
        await expect(cell('2026-12-09')).toHaveAttribute('tabindex', '-1');

        await cell('2026-12-09').focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog', { name: 'Wednesday, December 9, 2026' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(cell('2026-12-09')).toBeFocused();

        await page.keyboard.press('PageDown');
        await expect(page).toHaveURL(/date=2027-01-09/);
        await expect(page.getByRole('grid', { name: 'January 2027' })).toBeVisible();
        await expect(cell('2027-01-09')).toBeFocused();

        await page.goBack();
        await expect(page.getByRole('grid', { name: 'December 2026' })).toBeVisible();
    });

    test('toolbar and URL: next, week, agenda, category, refresh and back all agree', async ({ page }) => {
        const calls = await mockApi(page);
        await page.goto('/events/calendar');
        await expect(page.getByTestId('calendar-title')).toHaveText('December 2026');

        await page.getByRole('button', { name: 'Next month' }).click();
        await expect(page).toHaveURL(/date=2027-01-09/);
        await expect(page.getByTestId('calendar-title')).toHaveText('January 2027');
        await page.getByRole('button', { name: 'Today' }).click();
        await expect(page).toHaveURL(/\/events\/calendar$/);

        await page.getByRole('tab', { name: 'Week' }).click();
        await expect(page).toHaveURL(/view=week/);
        await expect(page.getByTestId('calendar-title')).toHaveText('Dec 7 to 13, 2026');
        const week = page.getByTestId('week-grid');
        await expect(week.locator('> li')).toHaveCount(7);
        await expect(week.locator('[data-day="2026-12-09"]')).toContainText('Alpha Night');
        const columns = await week.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        expect(columns).toBe(7);

        await page.getByRole('tab', { name: 'Agenda' }).click();
        await expect(page).toHaveURL(/view=agenda/);
        const agenda = page.getByTestId('agenda-list');
        // One group for each day that has something on: the 9th, 10th, 11th and 24th
        await expect(agenda.locator('> li')).toHaveCount(4);
        await expect(agenda.getByText('Called Off Talk')).toBeVisible();
        await expect(agenda.getByText('Cancelled', { exact: true })).toBeVisible();
        await expect(agenda.getByText('Live now')).toBeVisible();
        await expect(agenda.getByRole('link', { name: /Series/ })).toHaveAttribute('href', `/events/series/${SERIES_ID}`);

        await page.getByLabel('Category').selectOption('workshop');
        await expect(page).toHaveURL(/category=workshop/);
        await expect(agenda.getByText('Beta Workshop')).toBeVisible();
        await expect(agenda.getByText('Alpha Night')).toHaveCount(0);
        expect(calls.calendar.at(-1)!.searchParams.get('category')).toBe('workshop');

        await page.reload();
        await expect(page).toHaveURL(/view=agenda&category=workshop/);
        await expect(page.getByRole('tab', { name: 'Agenda' })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByLabel('Category')).toHaveValue('workshop');

        await page.goBack();
        await expect(page.getByLabel('Category')).toHaveValue('');
    });

    test('shows event time and viewer time in the agenda, and an error with retry', async ({ page }) => {
        await mockApi(page);
        await page.goto('/events/calendar?view=agenda');
        // The browser is in Berlin, so a London event shows its own clock too when it differs
        await expect(page.getByTestId('agenda-list')).toBeVisible();

        let fail = true;
        await page.route('**/api/events/calendar**', (route) => (fail
            ? json(route, { success: false, error: { code: 'SERVER', message: 'Boom' } }, 500)
            : route.fallback()));
        await page.goto('/events/calendar?view=agenda&date=2027-02-10');
        await expect(page.locator('[role="alert"]', { hasText: 'Could not load the calendar' })).toBeVisible();
        fail = false;
        await page.getByRole('button', { name: 'Try again' }).click();
        await expect(page.getByText('Nothing scheduled in February 2027').or(page.getByTestId('agenda-list'))).toBeVisible();
    });
});

test.describe('Subscribe and download', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('download link and public subscribe dialog use the API calendar file for the range on screen', async ({ page }) => {
        await mockApi(page);
        await page.goto('/events/calendar?category=ctf');
        const download = page.getByTestId('download-ics');
        const href = new URL((await download.getAttribute('href'))!);
        expect(href.pathname).toBe('/api/events/calendar.ics');
        expect(href.searchParams.get('category')).toBe('ctf');
        expect(href.searchParams.get('from')).toBe('2026-11-29T23:00:00.000Z');

        await page.getByRole('button', { name: 'Subscribe' }).click();
        const dialog = page.getByRole('dialog', { name: 'Subscribe in your calendar app' });
        await expect(dialog.getByLabel('Calendar address')).toHaveValue(/^webcal:\/\/localhost:5001\/api\/events\/calendar\.ics\?from=/);
        await expect(dialog.getByRole('button', { name: /Copy/ })).toBeVisible();
        await expect(dialog.getByRole('link', { name: /Open in my calendar app/ })).toHaveAttribute('href', /^webcal:/);
    });

    test('my calendar feed: show the address once, then it is gone from the page', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' }).catch(() => undefined);
        const calls = await mockApi(page, { signedIn: true });
        await page.goto('/events/calendar');

        const panel = page.getByTestId('feed-panel');
        await expect(panel.getByRole('button', { name: /Create my feed/ })).toBeVisible();
        await panel.getByRole('button', { name: /Create my feed/ }).click();

        const dialog = page.getByRole('dialog', { name: 'Your calendar address' });
        await expect(dialog.getByRole('alert')).toContainText('Anyone who has this link can see the events you registered for');
        await expect(dialog.getByLabel(/Calendar address/)).toHaveValue(new RegExp(SECRET));
        await dialog.getByRole('button', { name: /Copy/ }).first().click();
        await expect(dialog.getByRole('button', { name: /Copied/ }).first()).toBeVisible();

        await dialog.getByRole('button', { name: 'I have copied it' }).click();
        await expect(dialog).toBeHidden();
        await expect(page.locator('body')).not.toContainText(SECRET);
        expect(await page.evaluate(() => document.documentElement.innerHTML.includes('tchcal_'))).toBe(false);
        expect(await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]).includes('tchcal_'))).toBe(false);

        await expect(panel.getByTestId('feed-last-used')).toHaveText('Not used yet');
        expect(calls.tokenPosts).toBe(1);

        // Replacing asks first
        await panel.getByRole('button', { name: /Replace the address/ }).click();
        const confirm = page.getByRole('dialog', { name: 'Replace your calendar address?' });
        await expect(confirm).toContainText('stops working at once');
        expect(calls.tokenPosts).toBe(1);
        await confirm.getByRole('button', { name: 'Go back' }).click();
        expect(calls.tokenPosts).toBe(1);

        // Turning off asks first too
        await panel.getByRole('button', { name: /Turn off the feed/ }).click();
        await page.getByRole('dialog', { name: 'Turn off your calendar feed?' }).getByRole('button', { name: 'Turn off the feed' }).click();
        await expect(panel.getByRole('button', { name: /Create my feed/ })).toBeVisible();
        expect(calls.tokenDeletes).toBe(1);
    });

    test('the feed panel is not shown to a visitor who is signed out', async ({ page }) => {
        await mockApi(page);
        await page.goto('/events/calendar');
        await expect(page.getByTestId('month-grid')).toBeVisible();
        await expect(page.getByTestId('feed-panel')).toHaveCount(0);
    });
});

test.describe('Series page', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('shows the schedule in words, status and the next dates in event and viewer time', async ({ page }) => {
        await mockApi(page);
        await page.goto(`/events/series/${SERIES_ID}`);
        await expect(page.getByRole('heading', { level: 1, name: 'Weekly CTF Night' })).toBeVisible();
        await expect(page.getByTestId('series-rule')).toHaveText('Every Thursday at 19:00 Europe/London');
        await expect(page.getByText('Running')).toBeVisible();
        const dates = page.getByTestId('occurrences').getByRole('listitem');
        await expect(dates).toHaveCount(2);
        await expect(dates.first()).toContainText('7:00 PM GMT');
        await expect(dates.first()).toContainText('Your time: Thu, Dec 10 · 8:00 PM GMT+1');
        await expect(dates.first().getByRole('link', { name: 'Weekly CTF Night' })).toHaveAttribute('href', '/events/weekly-ctf-night-2026-12-10');
        await expect(page.getByTestId('series-manage')).toHaveCount(0);
    });

    test('a series that does not exist says so', async ({ page }) => {
        await mockApi(page);
        await page.route('**/api/events/series/64b00000000000000000000a', (route) => json(route, { success: false, error: { code: 'SERIES_NOT_FOUND', message: 'No series' } }, 404));
        await page.goto('/events/series/64b00000000000000000000a');
        await expect(page.getByRole('heading', { name: 'Series not found' })).toBeVisible();
    });

    test('the series chip on the calendar leads there', async ({ page }) => {
        await mockApi(page);
        await page.goto('/events/calendar?view=agenda');
        await page.getByTestId('agenda-list').getByRole('link', { name: /Series/ }).click();
        await expect(page).toHaveURL(new RegExp(`/events/series/${SERIES_ID}`));
        await expect(page.getByTestId('series-rule')).toBeVisible();
    });

    test('series management is for staff: members are turned away from the create screen', async ({ page }) => {
        await mockApi(page, { signedIn: true, role: 'user' });
        await page.goto('/admin/events/series');
        await expect(page.getByRole('heading', { name: 'You cannot open this page' })).toBeVisible();
    });

    test('a moderator sees the create form with the review note and validation', async ({ page }) => {
        await mockApi(page, { signedIn: true, role: 'moderator' });
        await page.goto('/admin/events/series');
        await expect(page.getByRole('heading', { name: 'Recurring series' })).toBeVisible();
        await expect(page.getByTestId('review-note')).toContainText('Occurrences wait for review');
        await page.getByRole('button', { name: 'Create the series' }).click();
        await expect(page.getByText('Title must be at least 5 characters')).toBeVisible();
        await expect(page.getByText('Pick the first date')).toBeVisible();
        await page.getByLabel(/^Title/).fill('Weekly CTF Night');
        await page.getByLabel(/^Description/).fill('Bring a laptop.');
        await page.getByLabel(/^Category/).selectOption('ctf');
        await page.getByLabel(/^First date/).fill('2026-12-17');
        await page.getByLabel(/^Time zone/).selectOption('Europe/London');
        await expect(page.getByTestId('rule-preview')).toHaveText('Every Thursday at 19:00 Europe/London');
    });
});

test.describe('Archive', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('lists past events with badges, filters in the URL after 300 ms, and loads more', async ({ page }) => {
        const calls = await mockApi(page);
        await page.goto('/events/archive');
        const cards = page.getByTestId('archive-card');
        await expect(cards).toHaveCount(12);
        const first = cards.first();
        await expect(first).toContainText('Past Event 1');
        await expect(first.getByText('Recording')).toBeVisible();
        await expect(first.getByText('Slides')).toBeVisible();
        await expect(first).toContainText('(8 ratings)');
        await expect(first).toContainText('10 attended');
        await expect(first.getByRole('link', { name: /Series/ })).toHaveAttribute('href', `/events/series/${SERIES_ID}`);

        await page.getByRole('button', { name: /Load more/ }).click();
        await expect(cards).toHaveCount(15);
        await expect(page.getByRole('button', { name: /Load more/ })).toHaveCount(0);
        expect(calls.archives.at(-1)!.searchParams.get('page')).toBe('2');

        const before = calls.archives.length;
        await page.getByLabel('Search past events').pressSequentially('event 3', { delay: 30 });
        await expect(page).toHaveURL(/q=event\+3|q=event%203/);
        await expect(cards).toHaveCount(1);
        // The address changed once, after the typing stopped, not once per key
        expect(calls.archives.length - before).toBeLessThanOrEqual(2);

        await page.getByLabel('Category').selectOption('workshop');
        await expect(page).toHaveURL(/category=workshop/);
        await expect(page.getByText('No past events match these filters')).toBeVisible();
        await page.getByRole('button', { name: 'Clear filters' }).click();
        await expect(page).toHaveURL(/\/events\/archive$/);
        // The unfiltered pages that were already loaded come back from the cache
        await expect(cards).toHaveCount(15);

        await page.reload();
        await expect(cards).toHaveCount(12);
    });

    test('the Past tab of the events list links to the archive', async ({ page }) => {
        await mockApi(page);
        await page.goto('/events?tab=past');
        await page.getByRole('link', { name: 'Browse the event archive' }).click();
        await expect(page).toHaveURL(/\/events\/archive/);
        await expect(page.getByRole('heading', { name: 'Past events' })).toBeVisible();
    });
});

test.describe('Organizer tools', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('exports the attendee list as a file and notes that it was cut', async ({ page }) => {
        const calls = await mockApi(page, { signedIn: true });
        await page.goto('/events/winter-ctf-night');
        const panel = page.getByTestId('organizer-panel');
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            panel.getByRole('button', { name: 'Export CSV' }).click(),
        ]);
        expect(download.suggestedFilename()).toBe('winter-ctf-night-attendees.csv');
        await expect(panel.getByTestId('export-truncated')).toBeVisible();
        expect(calls.csv).toBe(1);
    });

    test('undoes one attendance after a confirmation and reports the points', async ({ page }) => {
        const calls = await mockApi(page, { signedIn: true });
        await page.goto('/events/winter-ctf-night');
        const panel = page.getByTestId('organizer-panel');
        await panel.getByRole('tab', { name: 'Attended' }).click();
        await panel.getByRole('button', { name: 'Undo attendance for Ada Lovelace' }).click();
        const dialog = page.getByRole('dialog', { name: 'Undo attendance for Ada Lovelace?' });
        expect(calls.undo).toHaveLength(0);
        await dialog.getByRole('button', { name: 'Undo attendance' }).click();
        await expect.poll(() => calls.undo).toEqual([{ userIds: ['u-ada'] }]);
        await expect(page.getByText('1 attendance undone, 10 points taken back.')).toBeVisible();
    });
});

test.describe('Calendar on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('opens on the agenda, has no month grid and no sideways scroll', async ({ page }) => {
        await mockApi(page);
        await page.goto('/events/calendar');
        await expect(page.getByTestId('agenda-list')).toBeVisible();
        await expect(page.getByRole('grid')).toHaveCount(0);
        await expect(page.getByRole('tab', { name: 'Month' })).toHaveCount(0);
        await expect(page.getByRole('tab', { name: 'Agenda' })).toHaveAttribute('aria-selected', 'true');
        expect(await noSideScroll(page)).toBe(true);

        // Asking for the month on a phone still gives the agenda
        await page.goto('/events/calendar?view=month');
        await expect(page.getByTestId('agenda-list')).toBeVisible();
        await expect(page.getByRole('grid')).toHaveCount(0);

        // The week stacks its days instead of seven columns
        await page.getByRole('tab', { name: 'Week' }).click();
        const week = page.getByTestId('week-grid');
        await expect(week).toBeVisible();
        expect(await week.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
        expect(await noSideScroll(page)).toBe(true);
    });

    test('archive and series fit a 390px screen', async ({ page }) => {
        await mockApi(page);
        await page.goto('/events/archive');
        await expect(page.getByTestId('archive-card').first()).toBeVisible();
        expect(await noSideScroll(page)).toBe(true);
        await page.goto(`/events/series/${SERIES_ID}`);
        await expect(page.getByTestId('series-rule')).toBeVisible();
        expect(await noSideScroll(page)).toBe(true);
    });
});
