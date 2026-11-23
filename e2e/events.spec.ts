import { test, expect, type Page, type Route } from '@playwright/test';
import { signInAs, testUser } from './helpers';

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number, hours = 0) => new Date(Date.now() + offsetDays * DAY + hours * 3600_000).toISOString();

const viewerBase = {
    registered: false,
    waitlisted: false,
    attended: false,
    position: null,
    reminder: null,
    canRegister: false,
    canJoinWaitlist: false,
    canFeedback: false,
    hasFeedback: false,
    joinOpensAt: null,
    canManage: false,
};

function makeEvent(overrides: Record<string, unknown> = {}) {
    return {
        _id: 'a'.repeat(24),
        slug: 'winter-ctf-night',
        title: 'Winter CTF Night',
        shortDescription: 'Web and crypto challenges.',
        description: 'A friendly night of **web and crypto** challenges.',
        category: 'ctf',
        status: 'upcoming',
        locationType: 'online',
        location: 'Online',
        timezone: 'Europe/Berlin',
        startDate: iso(5),
        endDate: iso(5, 2),
        organizer: 'Community Team',
        tags: ['beginner'],
        speakers: [],
        maxParticipants: 60,
        registeredCount: 42,
        waitlistCount: 0,
        spotsLeft: 18,
        isFull: false,
        waitlistEnabled: true,
        hasRecording: false,
        hasSlides: false,
        ...overrides,
    };
}

function reply(route: Route, body: unknown, status = 200) {
    const headers = {
        'access-control-allow-origin': route.request().headers()['origin'] || '*',
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
}

const page1 = (n: number) => ({ page: 1, limit: 12, total: n, totalPages: 1, hasMore: false });

/** Routes registered later win in Playwright, so call this after signInAs. */
async function mockEventsApi(page: Page, handlers: { list?: unknown[]; detail?: Record<string, unknown>; onRegister?: () => void; registerStatus?: number }) {
    await page.route('**/api/events**', (route) => {
        const url = new URL(route.request().url());
        const method = route.request().method();
        const path = url.pathname.replace(/^\/api\/events\/?/, '');

        if (method === 'OPTIONS') return reply(route, {});
        if (method === 'GET' && path === '') {
            const items = handlers.list ?? [];
            return reply(route, { success: true, data: items, pagination: page1(items.length) });
        }
        if (method === 'POST' && path.endsWith('/register')) {
            handlers.onRegister?.();
            if (handlers.registerStatus && handlers.registerStatus >= 400) {
                return reply(route, { success: false, error: { code: 'EVENT_FULL', message: 'Full' } }, handlers.registerStatus);
            }
            return reply(route, { success: true, data: { status: 'registered' } });
        }
        if (method === 'GET' && handlers.detail) {
            return reply(route, { success: true, data: handlers.detail });
        }
        return reply(route, { success: true, data: [] });
    });
}

test.describe('Events list', () => {
    test('shows real events from the API with availability badges', async ({ page }) => {
        await signInAs(page);
        await mockEventsApi(page, {
            list: [
                makeEvent(),
                makeEvent({ _id: 'b'.repeat(24), slug: 'full-night', title: 'Reverse Engineering Workshop', isFull: true, spotsLeft: 0, registeredCount: 30, maxParticipants: 30 }),
            ],
        });
        await page.goto('/events');

        await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: /Winter CTF Night/ }).first()).toBeVisible();
        await expect(page.getByText('18 spots left')).toBeVisible();
        await expect(page.getByText(/Full · waitlist open/).first()).toBeVisible();
    });

    test('shows an empty state and no sample events when the API has none', async ({ page }) => {
        await signInAs(page);
        await mockEventsApi(page, { list: [] });
        await page.goto('/events');

        await expect(page.getByText(/no (upcoming )?events/i).first()).toBeVisible();
        await expect(page.locator('[data-testid="event-card"]')).toHaveCount(0);
    });

    test('shows the API error instead of sample data when the list fails', async ({ page }) => {
        await signInAs(page);
        await page.route('**/api/events**', (route) => reply(route, { success: false, error: { code: 'SERVER', message: 'Boom' } }, 500));
        await page.goto('/events');

        await expect(page.getByRole('alert').first()).toBeVisible();
        await expect(page.locator('[data-testid="event-card"]')).toHaveCount(0);
    });

    test('keeps the search term in the URL', async ({ page }) => {
        await signInAs(page);
        await mockEventsApi(page, { list: [makeEvent()] });
        await page.goto('/events');

        await page.getByPlaceholder('Search events').fill('crypto');
        await expect(page).toHaveURL(/q=crypto/);
    });

    test('links to the month agenda', async ({ page }) => {
        await signInAs(page);
        await mockEventsApi(page, { list: [makeEvent()] });
        await page.goto('/events');

        await page.getByRole('link', { name: /calendar/i }).first().click();
        await expect(page).toHaveURL(/\/events\/calendar/);
        await expect(page.getByRole('heading', { name: /event calendar/i })).toBeVisible();
    });
});

test.describe('Event detail', () => {
    test('lets a member register when the viewer block allows it', async ({ page }) => {
        let registered = 0;
        await signInAs(page, { ...testUser });
        await mockEventsApi(page, {
            detail: makeEvent({ viewer: { ...viewerBase, canRegister: true } }),
            onRegister: () => { registered += 1; },
        });
        await page.goto('/events/winter-ctf-night');

        await expect(page.getByRole('heading', { name: 'Winter CTF Night', level: 1 })).toBeVisible();
        await expect(page.getByText(/Event time zone: Europe\/Berlin/)).toBeVisible();
        await page.getByRole('button', { name: 'Register', exact: true }).click();
        await expect.poll(() => registered).toBe(1);
    });

    test('offers the waiting list on a full event', async ({ page }) => {
        await signInAs(page);
        await mockEventsApi(page, {
            detail: makeEvent({ isFull: true, spotsLeft: 0, waitlistCount: 3, viewer: { ...viewerBase, canJoinWaitlist: true } }),
        });
        await page.goto('/events/winter-ctf-night');

        await expect(page.getByRole('button', { name: /join the waiting list/i })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Register', exact: true })).toHaveCount(0);
    });

    test('shows no register or waiting list button when the event is full without a waiting list', async ({ page }) => {
        await signInAs(page);
        // What the API sends: both flags false
        await mockEventsApi(page, {
            detail: makeEvent({ isFull: true, spotsLeft: 0, waitlistEnabled: false, viewer: { ...viewerBase } }),
        });
        await page.goto('/events/winter-ctf-night');

        await expect(page.getByText(/full and has no waiting list/i)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Register', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /waiting list/i })).toHaveCount(0);
    });

    test('shows the recording after the event has ended', async ({ page }) => {
        await signInAs(page);
        await mockEventsApi(page, {
            detail: makeEvent({
                status: 'ended',
                startDate: iso(-5),
                endDate: iso(-5, 2),
                hasRecording: true,
                recordingLink: 'https://video.example.org/r',
                viewer: { ...viewerBase },
            }),
        });
        await page.goto('/events/winter-ctf-night');

        const recording = page.getByRole('link', { name: /watch the recording/i });
        await expect(recording).toHaveAttribute('href', 'https://video.example.org/r');
        await expect(page.getByRole('button', { name: 'Register', exact: true })).toHaveCount(0);
    });

    test('explains a cancelled event with the reason', async ({ page }) => {
        await signInAs(page);
        await mockEventsApi(page, {
            detail: makeEvent({ status: 'cancelled', cancelReason: 'The venue closed.', viewer: { ...viewerBase } }),
        });
        await page.goto('/events/winter-ctf-night');

        await expect(page.getByText('This event was cancelled.').first()).toBeVisible();
        await expect(page.getByText('The venue closed.')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Register', exact: true })).toHaveCount(0);
    });
});

test.describe('Access control', () => {
    test('sends guests who open the submit form to sign in', async ({ page }) => {
        await page.route('**/api/**', (route) => reply(route, { success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in' } }, 401));
        await page.goto('/events/submit');
        await expect(page).toHaveURL(/\/auth\?redirect=%2Fevents%2Fsubmit/);
    });

    test('keeps regular members out of the review queue', async ({ page }) => {
        await signInAs(page);
        await mockEventsApi(page, {});
        await page.goto('/admin/events');
        await expect(page.getByRole('heading', { name: 'You cannot open this page' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    });
});
