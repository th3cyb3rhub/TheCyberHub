import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mockCodeReviewApi, VISITOR as CODE_REVIEW_VISITOR } from '../code-review-mocks';
import { mockCtfApi, VISITOR as CTF_VISITOR } from '../ctf-mocks';
import { mockInternshipsApi } from '../internships-mocks';
import { mockJobsApi } from '../jobs-mocks';
import { mockLearningApi } from '../learning-mocks';
import { mockMentorshipApi } from '../mentorship-mocks';
import { mockLabsApi, VISITOR as LABS_VISITOR } from '../labs-mocks';

/**
 * A real HTTP server that answers like the API for a visitor, built from the same in-memory mocks the
 * browser specs use (their `page.route` handlers are driven through a stand-in page). The app's own
 * server fetches the public copy of a page while it renders, and a browser route cannot intercept that:
 * start the app with `NEXT_PUBLIC_API_URL` pointing at this server to see the server rendered HTML.
 *
 * Old job address: `OLD_JOB_SLUG` answers as the previous slug of the first job.
 */

// Only this machine can reach it, and only the app's own origins get a CORS answer
const HOST = '127.0.0.1';
const ALLOWED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const allowOrigin = (origin: string | undefined): Record<string, string> =>
    origin && ALLOWED_ORIGIN.test(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};

export const OLD_JOB_SLUG = 'old-pentester-slug';

export const EVENT_SLUG = 'winter-ctf-night';
const EVENT = {
    _id: 'e'.repeat(24), slug: EVENT_SLUG, title: 'Winter CTF Night', shortDescription: null,
    description: 'A night of **challenges** with a [guide](https://example.org/guide).\n\n- web\n- crypto', category: 'ctf', status: 'upcoming',
    locationType: 'online', location: 'Online', timezone: 'Europe/Berlin', startDate: '2027-12-05T17:00:00.000Z', endDate: '2027-12-05T19:00:00.000Z', endsAt: '2027-12-05T19:00:00.000Z',
    organizer: 'Ada', tags: [], speakers: [], maxParticipants: 60, registeredCount: 42, waitlistCount: 0, spotsLeft: 18, isFull: false, waitlistEnabled: true, eventType: 'community',
    isFeatured: false, hasRecording: false, hasSlides: false, averageRating: null, ratingCount: 0, rsvpDeadline: null, image: null, bannerImage: null, venue: null,
    registrationLink: null, recordingLink: null, slidesLink: null, summaryNotes: null, joinLink: null, defaultDurationMinutes: null, stats: { registered: 42, waitlisted: 0, attended: 0, spotsLeft: 18, averageRating: null, ratingCount: 0 },
    viewer: null,
};

type Handler = (route: FakeRoute) => Promise<void> | void;
interface FakeRoute {
    request: () => { url: () => string; method: () => string; headers: () => Record<string, string | string[] | undefined>; postDataJSON: () => unknown; postData: () => string };
    fulfill: (o: { status?: number; body?: string; contentType?: string; headers?: Record<string, string> }) => Promise<void>;
    abort: () => Promise<void>;
    fallback: () => Promise<void>;
}

/** `**` matches anything, `*` anything but a slash: the part of Playwright's URL globs the mocks use */
const globToRegExp = (glob: string) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`);

/** The only parts of Playwright's `Page` the mocks touch. The newest handler sees a request first; a handler whose pattern does not match passes it on. */
const fakePage = () => {
    const handlers: Handler[] = [];
    return {
        handlers,
        addInitScript: async () => undefined,
        route: async (pattern: unknown, handler: Handler) => {
            const matches = typeof pattern === 'string' ? globToRegExp(pattern) : null;
            handlers.unshift(matches ? (route) => (matches.test(route.request().url().split('?')[0]) ? handler(route) : route.fallback()) : handler);
        },
    };
};

export async function startMockApi(port = 0): Promise<{ url: string; port: number; close: () => Promise<void> }> {
    const pages = { jobs: fakePage(), labs: fakePage(), ctf: fakePage(), codeReview: fakePage(), internships: fakePage(), learning: fakePage(), mentorship: fakePage(), events: fakePage() };
    type AnyPage = Parameters<typeof mockJobsApi>[0];
    const jobsState = await mockJobsApi(pages.jobs as unknown as AnyPage, 'visitor');
    jobsState.jobs[0].slugHistory = [OLD_JOB_SLUG];
    await mockLabsApi(pages.labs as unknown as AnyPage, LABS_VISITOR);
    await mockCtfApi(pages.ctf as unknown as AnyPage, CTF_VISITOR);
    await mockCodeReviewApi(pages.codeReview as unknown as AnyPage, CODE_REVIEW_VISITOR);
    await mockInternshipsApi(pages.internships as unknown as AnyPage, { id: '', role: null });
    await mockLearningApi(pages.learning as unknown as AnyPage, { role: null });
    await mockMentorshipApi(pages.mentorship as unknown as AnyPage);
    await pages.events.route('**/api/events/**', (route) => {
        const slug = new URL(route.request().url()).pathname.split('/').pop();
        if (slug !== EVENT_SLUG) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' } }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: EVENT }) });
    });

    const pick = (path: string) =>
        path.startsWith('/api/events') ? pages.events
        : /^\/api\/(learning-paths|certificates|resources|bookmarks\/learning|daily-challenge|onboarding)/.test(path) ? pages.learning
            : /^\/api\/(mentors|mentorship|mentorships|sessions)/.test(path) ? pages.mentorship
        : /^\/api\/(jobs|companies|bookmarks|moderation|auth\/me)/.test(path) ? pages.jobs
            : path.startsWith('/api/labs') ? pages.labs
                : path.startsWith('/api/ctf-competitions') ? pages.ctf
                    : path.startsWith('/api/code-review') ? pages.codeReview
                        : path.startsWith('/api/internships') ? pages.internships
                            : null;

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString();
        let answered = false;
        const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
            answered = true;
            res.writeHead(status, { 'content-type': 'application/json', ...allowOrigin(req.headers.origin), ...headers });
            res.end(typeof body === 'string' ? body : JSON.stringify(body));
        };
        // The browser asks before it calls from another origin: allow it, for every path
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                ...allowOrigin(req.headers.origin),
                'access-control-allow-credentials': 'true',
                'access-control-allow-headers': 'content-type, authorization',
                'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
            });
            res.end();
            return;
        }
        const page = pick(url.pathname);
        if (!page) {
            // Other areas have no mock here: a list is empty and anything with an id is not found
            if (url.pathname.split('/').length > 3) {
                send(404, { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
                return;
            }
            send(200, { success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1, pages: 1, hasMore: false } });
            return;
        }
        const route = (rest: Handler[]): FakeRoute => ({
            request: () => ({
                url: () => url.toString(),
                method: () => req.method || 'GET',
                headers: () => req.headers,
                postDataJSON: () => JSON.parse(raw || 'null'),
                postData: () => raw,
            }),
            // The API stamps its answers: the pages read the age of what they render from this header
            fulfill: async (o) => send(o.status ?? 200, o.body ?? '', { ...(o.contentType ? { 'content-type': o.contentType } : {}), ...(o.headers ?? {}), date: new Date().toUTCString() }),
            abort: async () => send(500, {}),
            fallback: async () => { const [next, ...others] = rest; if (next) await next(route(others)); else send(404, { success: false }); },
        });
        const [first, ...others] = page.handlers;
        try { await first(route(others)); } catch { if (!answered) send(500, { success: false }); }
        if (!answered) send(500, { success: false });
    });
    await new Promise<void>((resolve) => server.listen(port, HOST, resolve));
    const bound = (server.address() as AddressInfo).port;
    return {
        url: `http://${HOST}:${bound}`,
        port: bound,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}
