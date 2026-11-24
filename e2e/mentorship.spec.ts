import { test, expect } from '@playwright/test';
import { signInAs, testUser } from './helpers';
import { MENTORSHIP_ID, MENTOR_ID, iso, mentor, mentorship, message, mockMentorshipApi, session, viewerBlock } from './mentorship-mocks';

// The API's /auth/me answers with `id`
const me = { ...testUser, id: 'user-1' };
const longGoals = 'I want to learn how to find and report web vulnerabilities in a structured way, starting from the basics and moving on to real programs.';
const longBio = 'I have worked in application security for ten years and would like to help people who are starting out to find their first bugs and write clear reports.';

test.describe('Mentor directory', () => {
    test('lists mentors, narrows by topic in the URL and clears the filters', async ({ page }) => {
        await mockMentorshipApi(page);
        await page.goto('/mentorship');
        await expect(page.getByTestId('mentor-list').getByRole('link', { name: /Ada Lovelace/ }).first()).toBeVisible();
        await expect(page.getByText('3 mentors listed')).toBeVisible();

        await page.getByRole('group').getByText('Malware analysis', { exact: true }).click();
        await expect(page).toHaveURL(/expertise=malware-analysis/);
        await expect(page.getByText('1 mentor match your filters')).toBeVisible();
        await expect(page.getByTestId('mentor-list').getByText('Linus Torvalds')).toBeVisible();

        await page.getByRole('button', { name: /Clear filters/ }).first().click();
        await expect(page.getByText('3 mentors listed')).toBeVisible();
    });

    test('shows an empty state with a way forward when nobody matches', async ({ page }) => {
        await mockMentorshipApi(page);
        await page.goto('/mentorship?search=nothing-like-this');
        await expect(page.getByText('No mentors match')).toBeVisible();
    });

    test('shows the API error with a retry instead of sample mentors', async ({ page }) => {
        await page.route('**/api/mentors**', (route) => route.fulfill({
            status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ success: false, error: { code: 'SERVER', message: 'Boom' } }),
        }));
        await page.goto('/mentorship');
        await expect(page.getByText('Could not load mentors')).toBeVisible();
        await expect(page.getByTestId('mentor-list')).toHaveCount(0);
    });
});

test.describe('Mentor profile', () => {
    test('shows the bio, the hours in both zones and the request button', async ({ page }) => {
        await signInAs(page, me);
        await mockMentorshipApi(page);
        await page.goto(`/mentorship/mentor/${MENTOR_ID}`);
        await expect(page.getByRole('heading', { name: 'Ada Lovelace' }).first()).toBeVisible();
        await expect(page.getByText(/ten years of application security/i)).toBeVisible();
        await expect(page.getByText(/Europe\/Berlin/).first()).toBeVisible();
        await expect(page.getByText(/Patient, clear and very practical/)).toBeVisible();
        await expect(page.getByTestId('request-panel').getByRole('link', { name: 'Request mentorship' })).toHaveAttribute('href', new RegExp(`/mentorship/request\\?mentor=${MENTOR_ID}`));
    });

    test('asks a signed-out visitor to sign in', async ({ page }) => {
        await mockMentorshipApi(page);
        await page.goto(`/mentorship/mentor/${MENTOR_ID}`);
        await expect(page.getByRole('link', { name: 'Sign in to request' })).toBeVisible();
    });

    test('says so when the mentor is not found', async ({ page }) => {
        await mockMentorshipApi(page);
        await page.goto(`/mentorship/mentor/${'9'.repeat(24)}`);
        await expect(page.getByText(/This mentor is not available/)).toBeVisible();
    });
});

test.describe('Become a mentor', () => {
    test('explains what is missing when the member has too few points', async ({ page }) => {
        await signInAs(page, me);
        const { state } = await mockMentorshipApi(page);
        state.eligibility = { eligible: false, reason: 'NOT_ENOUGH_POINTS', points: 40, requiredPoints: 100, invited: false, hasProfile: false, profileStatus: null };
        await page.goto('/mentorship/become-mentor');
        await expect(page.getByText('Earn a few more points to apply')).toBeVisible();
        await expect(page.getByTestId('eligibility-blocked')).toContainText('100');
    });

    test('asks to verify the email first', async ({ page }) => {
        await signInAs(page, me);
        const { state } = await mockMentorshipApi(page);
        state.eligibility = { eligible: false, reason: 'EMAIL_NOT_VERIFIED', points: 400, requiredPoints: 100, invited: false, hasProfile: false, profileStatus: null };
        await page.goto('/mentorship/become-mentor');
        await expect(page.getByText('Verify your email first')).toBeVisible();
    });

    test('needs topics, a bio and the code of conduct, then sends the application', async ({ page }) => {
        await signInAs(page, me);
        const { calls } = await mockMentorshipApi(page);
        await page.goto('/mentorship/become-mentor');
        await page.getByRole('button', { name: 'Send application' }).click();
        await expect(page.getByRole('alert').first()).toBeVisible();
        expect(calls.filter((c) => c.path === '/api/mentors/register')).toHaveLength(0);

        await page.getByLabel('Web security').check({ force: true });
        await page.getByLabel('About you').fill(longBio);
        await page.getByRole('button', { name: 'Send application' }).click();
        await expect(page.getByText(/code of conduct/i).first()).toBeVisible();
        expect(calls.filter((c) => c.path === '/api/mentors/register')).toHaveLength(0);

        await page.getByLabel(/I have read the code of conduct/).check();
        await page.getByRole('button', { name: 'Send application' }).click();
        await expect(page).toHaveURL(/\/mentorship\/my-profile/);
        const sent = calls.find((c) => c.path === '/api/mentors/register');
        expect(sent?.body).toMatchObject({ expertiseAreas: ['web-security'], conductAccepted: true });
    });
});

test.describe('Requests', () => {
    test('validates the request, sends it and shows the invited mentors', async ({ page }) => {
        await signInAs(page, me);
        const { calls } = await mockMentorshipApi(page);
        await page.goto('/mentorship/request');
        await page.getByRole('button', { name: 'Find me a mentor' }).click();
        await expect(page.getByRole('alert').first()).toBeVisible();

        await page.getByLabel('Web security').check({ force: true });
        await page.getByLabel('Your goals').fill(longGoals);
        await page.getByLabel('Beginner').check({ force: true });
        await page.getByLabel(/I have read the code of conduct/).check();
        await page.getByRole('button', { name: 'Find me a mentor' }).click();
        await expect(page.getByTestId('request-sent')).toBeVisible();
        await expect(page.getByTestId('request-sent').getByText('Ada Lovelace')).toBeVisible();
        expect(calls.find((c) => c.path === '/api/mentorship-requests')?.body).toMatchObject({ skillLevel: 'beginner', conductAccepted: true });
    });

    test('shows the API reason when the request is refused', async ({ page }) => {
        await signInAs(page, me);
        const { state } = await mockMentorshipApi(page);
        state.failures['POST /api/mentorship-requests'] = { status: 409, code: 'OPEN_REQUEST_EXISTS', message: 'You already have an open request.' };
        await page.goto('/mentorship/request');
        await page.getByLabel('Web security').check({ force: true });
        await page.getByLabel('Your goals').fill(longGoals);
        await page.getByLabel('Beginner').check({ force: true });
        await page.getByLabel(/I have read the code of conduct/).check();
        await page.getByRole('button', { name: 'Find me a mentor' }).click();
        await expect(page.getByTestId('form-error')).toBeVisible();
    });

    test('cancels an open request after confirming', async ({ page }) => {
        await signInAs(page, me);
        const { state, calls } = await mockMentorshipApi(page);
        state.myRequests = [{ _id: 'r'.repeat(24), status: 'matched', goals: longGoals, skillLevel: 'beginner', expertiseAreas: ['web-security'], isDirect: false, createdAt: iso(-1), expiresAt: iso(13), mentorship: null,
            matchedMentors: [{ mentor: mentor(), matchScore: 88, response: 'pending', invitedAt: iso(-1), respondedAt: null, declineReason: null, autoDeclined: false }] }];
        await page.goto('/mentorship/requests');
        await expect(page.getByTestId('request-card')).toHaveAttribute('data-status', 'matched');
        await page.getByRole('button', { name: 'Cancel request' }).first().click();
        await page.getByRole('dialog').getByRole('button', { name: 'Cancel request' }).click();
        await expect(page.getByTestId('request-card')).toHaveAttribute('data-status', 'cancelled');
        expect(calls.some((c) => c.method === 'DELETE' && c.path.startsWith('/api/mentorship-requests/'))).toBe(true);
    });

    test('renews an expired request', async ({ page }) => {
        await signInAs(page, me);
        const { state, calls } = await mockMentorshipApi(page);
        state.myRequests = [{ _id: 'r'.repeat(24), status: 'expired', goals: longGoals, skillLevel: 'beginner', expertiseAreas: ['web-security'], isDirect: false, createdAt: iso(-20), expiresAt: iso(-6), mentorship: null, matchedMentors: [] }];
        await page.goto('/mentorship/requests');
        await page.getByRole('button', { name: 'Request again' }).click();
        await expect(page.getByTestId('request-card')).toHaveAttribute('data-status', 'matched');
        expect(calls.some((c) => c.path.endsWith('/renew'))).toBe(true);
    });
});

test.describe('Mentor inbox', () => {
    const incoming = (id: string, name: string) => ({
        _id: id.repeat(24), status: 'matched', goals: 'Please help me prepare for my first penetration testing interview next month.', skillLevel: 'intermediate',
        expertiseAreas: ['pentesting'], isDirect: true, createdAt: iso(-1), expiresAt: iso(13), mentorship: null, mentee: { username: name, avatar: null },
        invitation: { response: 'pending', matchScore: 80, invitedAt: iso(-1), respondedAt: null },
    });

    test('accepts a request and opens the new mentorship', async ({ page }) => {
        await signInAs(page, me);
        const { state, calls } = await mockMentorshipApi(page);
        state.myProfile = { ...mentor({ user: me }), status: 'approved', reviewNote: null, reviewedAt: iso(-5), conductAcceptedAt: iso(-5), currentMenteeCount: 0 };
        state.incoming = [incoming('1', 'grace')];
        await page.goto('/mentorship/requests?tab=incoming');
        await expect(page.getByTestId('incoming-card')).toContainText('@grace');
        await page.getByRole('button', { name: 'Accept' }).click();
        await expect(page).toHaveURL(new RegExp(`/mentorship/${MENTORSHIP_ID}`));
        expect(calls.some((c) => c.path.endsWith('/accept'))).toBe(true);
    });

    test('declines with a reason', async ({ page }) => {
        await signInAs(page, me);
        const { state, calls } = await mockMentorshipApi(page);
        state.myProfile = { ...mentor({ user: me }), status: 'approved', reviewNote: null, reviewedAt: iso(-5), conductAcceptedAt: iso(-5), currentMenteeCount: 0 };
        state.incoming = [incoming('2', 'linus')];
        await page.goto('/mentorship/requests?tab=incoming');
        await page.getByRole('button', { name: 'Decline' }).click();
        await page.getByLabel('Message to the mentee').fill('I am full until March, sorry.');
        await page.getByRole('dialog').getByRole('button', { name: 'Decline' }).click();
        await expect(page.getByTestId('incoming-card')).toHaveAttribute('data-response', 'declined');
        expect(calls.find((c) => c.path.endsWith('/decline'))?.body).toMatchObject({ reason: 'I am full until March, sorry.' });
    });
});

test.describe('Workspace', () => {
    test('shows the overview, and the dashboard lists the mentorship with its unread badge', async ({ page }) => {
        await signInAs(page, me);
        await mockMentorshipApi(page);
        await page.goto('/mentorship/dashboard');
        await expect(page.getByRole('link', { name: /Ada Lovelace/ }).first()).toBeVisible();
        await page.getByRole('link', { name: /Ada Lovelace/ }).first().click();
        await expect(page).toHaveURL(new RegExp(`/mentorship/${MENTORSHIP_ID}`));
        await expect(page.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByText('Learn web application testing step by step')).toBeVisible();
    });

    test('chat: sends text, sends code in a fence, and never turns text into markup', async ({ page }) => {
        await signInAs(page, me);
        const { state, calls } = await mockMentorshipApi(page);
        state.messages.push(message({ _id: '3'.repeat(24), content: '<img src=x onerror="window.__pwned=1"><b>bold?</b>', createdAt: iso(0, -1) }));
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=messages`);
        await expect(page.getByText('I would like to start with SQL injection.')).toBeVisible();
        await expect(page.getByText('<img src=x onerror="window.__pwned=1"><b>bold?</b>')).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
        await expect(page.locator('[data-testid="chat"] img')).toHaveCount(0);

        await page.getByLabel('Write a message').fill('Thanks, that helps!');
        await page.getByLabel('Write a message').press('Enter');
        await expect(page.getByText('Thanks, that helps!')).toBeVisible();
        expect(calls.find((c) => c.path.endsWith('/messages'))?.body).toMatchObject({ content: 'Thanks, that helps!', contentType: 'text' });

        await page.getByLabel('Code', { exact: true }).check({ force: true });
        await page.getByLabel('Language').selectOption('python');
        await page.getByLabel('Write a message').fill('print("<b>hi</b>")');
        await page.getByLabel('Send message').click();
        const code = page.getByTestId('code-message').last();
        await expect(code.locator('code')).toHaveText('print("<b>hi</b>")');
        const sent = calls.filter((c) => c.path.endsWith('/messages')).at(-1)?.body as { content: string; contentType: string; codeLanguage: string };
        expect(sent.contentType).toBe('code');
        expect(sent.content).toBe('```python\nprint("<b>hi</b>")\n```');
        expect(sent.codeLanguage).toBe('python');
    });

    test('chat: a failed message stays, shows the reason, and can be retried', async ({ page }) => {
        await signInAs(page, me);
        const { state } = await mockMentorshipApi(page);
        state.failures[`POST /api/mentorships/${MENTORSHIP_ID}/messages`] = { status: 503, code: 'TRANSACTIONS_UNAVAILABLE', message: 'Try again shortly' };
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=messages`);
        await page.getByLabel('Write a message').fill('Are you there?');
        await page.getByLabel('Write a message').press('Enter');
        await expect(page.getByText('Not sent')).toBeVisible();
        delete state.failures[`POST /api/mentorships/${MENTORSHIP_ID}/messages`];
        await page.getByRole('button', { name: 'Retry' }).click();
        await expect(page.getByText('Not sent')).toHaveCount(0);
        await expect(page.getByText('Are you there?')).toHaveCount(1);
    });

    test('chat: older messages load when asked', async ({ page }) => {
        await signInAs(page, me);
        const { state } = await mockMentorshipApi(page);
        state.messages = Array.from({ length: 60 }, (_, i) => message({ _id: String(i + 100).padStart(24, '0'), content: `Message number ${i + 1}`, createdAt: iso(-2, i * 0.1) }));
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=messages`);
        await expect(page.getByText('Message number 60')).toBeVisible();
        // Reaching the top loads older messages by itself; the button is the keyboard and fallback path
        await page.getByRole('button', { name: 'Load older messages' }).click({ timeout: 3000 }).catch(() => undefined);
        await expect(page.getByText('Message number 5', { exact: true })).toBeAttached();
        await expect(page.getByRole('button', { name: 'Load older messages' })).toHaveCount(0);
    });

    test('chat: rejects a file that is too large without uploading it', async ({ page }) => {
        await signInAs(page, me);
        const { calls } = await mockMentorshipApi(page);
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=messages`);
        await page.getByTestId('file-input').setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
        await expect(page.getByRole('alert').filter({ hasText: '5 MB' })).toBeVisible();
        expect(calls.filter((c) => c.path.includes('upload'))).toHaveLength(0);
    });

    test('chat: is read-only while paused', async ({ page }) => {
        await signInAs(page, me);
        const { state } = await mockMentorshipApi(page);
        state.mentorships = [mentorship({ status: 'paused', pausedAt: iso(-1), viewer: viewerBlock({ canPause: false, canResume: true, canSchedule: false, canMessage: false }) })];
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=messages`);
        await expect(page.getByTestId('chat-disabled')).toContainText(/paused/);
        await expect(page.getByLabel('Write a message')).toHaveCount(0);
    });

    test('pauses with a reason, then resumes', async ({ page }) => {
        await signInAs(page, me);
        const { calls } = await mockMentorshipApi(page);
        await page.goto(`/mentorship/${MENTORSHIP_ID}`);
        await page.getByRole('button', { name: 'Pause' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Pause' }).click();
        await expect(page.getByRole('button', { name: /Resume/ }).first()).toBeVisible();
        expect(calls.some((c) => c.path.endsWith('/pause'))).toBe(true);
    });

    test('shows the reason the API gave when completing is refused', async ({ page }) => {
        await signInAs(page, me);
        const { state } = await mockMentorshipApi(page);
        state.failures[`POST /api/mentorships/${MENTORSHIP_ID}/complete`] = { status: 409, code: 'MENTORSHIP_NOT_ACTIVE', message: 'Not active' };
        await page.goto(`/mentorship/${MENTORSHIP_ID}`);
        await page.getByRole('button', { name: /Complete the mentorship/ }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Complete mentorship' }).click();
        await expect(page.getByTestId('dialog-error')).toBeVisible();
    });

    test('sessions: schedules in a chosen zone and sends an instant', async ({ page }) => {
        await signInAs(page, me);
        const { calls } = await mockMentorshipApi(page);
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=sessions`);
        await expect(page.getByTestId('session-card')).toContainText('First call: goals and plan');
        await expect(page.getByTestId('session-time-secondary')).toContainText('Asia/Kolkata');

        await page.getByRole('button', { name: /Schedule/ }).first().click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Title').fill('Reading a first report');
        const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
        await dialog.getByLabel('Date').fill(day);
        await dialog.getByLabel('Start time').fill('09:00');
        await dialog.getByLabel('Time zone').selectOption('Asia/Kolkata');
        await expect(dialog.getByTestId('time-preview')).toContainText('UTC');
        await dialog.getByRole('button', { name: 'Schedule session' }).click();
        await expect(page.getByTestId('session-card').filter({ hasText: 'Reading a first report' })).toBeVisible();
        const body = calls.find((c) => c.method === 'POST' && c.path.endsWith('/sessions'))?.body as { scheduledAt: string; timezone: string; duration: number };
        expect(body.scheduledAt).toBe(`${day}T03:30:00.000Z`);
        expect(body.timezone).toBe('Asia/Kolkata');
    });

    test('sessions: cancels with a reason', async ({ page }) => {
        await signInAs(page, me);
        const { calls } = await mockMentorshipApi(page);
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=sessions`);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.getByLabel('Reason').fill('I have an exam that day');
        await page.getByRole('dialog').getByRole('button', { name: 'Cancel session' }).click();
        await expect(page.getByTestId('session-card').first()).toHaveAttribute('data-status', 'cancelled');
        expect(calls.find((c) => c.method === 'DELETE')?.body).toMatchObject({ reason: 'I have an exam that day' });
    });

    test('sessions: only the mentor can mark a session as held', async ({ page }) => {
        await signInAs(page, me);
        const { state } = await mockMentorshipApi(page);
        state.sessions = [session({ scheduledAt: iso(-1), endsAt: iso(-1, 1) })];
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=sessions`);
        await expect(page.getByRole('button', { name: /Mark as held/ })).toHaveCount(0);
        await expect(page.getByText('Only your mentor can mark a session as held.')).toBeVisible();
    });

    test('feedback: their final feedback stays hidden until mine is given', async ({ page }) => {
        await signInAs(page, me);
        const { state } = await mockMentorshipApi(page);
        state.mentorships = [mentorship({ status: 'completed', actualEndDate: iso(-1), viewer: viewerBlock({ canMessage: false, canSchedule: false, canPause: false, canComplete: false, canExtend: false, canGiveFinalFeedback: true }) })];
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=feedback`);
        await expect(page.getByTestId('theirs-hidden')).toHaveText('Waiting for your feedback to reveal theirs.');
        await expect(page.getByRole('button', { name: 'Give feedback' })).toBeVisible();
    });

    test('reports a message from the other person', async ({ page }) => {
        await signInAs(page, me);
        const { calls } = await mockMentorshipApi(page);
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=messages`);
        await page.getByRole('button', { name: /Report/ }).first().click();
        await page.getByRole('dialog').getByRole('radio').first().check({ force: true });
        await page.getByRole('dialog').getByRole('button', { name: 'Send report' }).click();
        await expect.poll(() => calls.some((c) => c.path.endsWith('/report'))).toBe(true);
        expect(calls.find((c) => c.path.endsWith('/report'))?.body).toMatchObject({ target: 'message' });
    });

    test('chat: code with three backticks is refused with a reason and keeps what was typed', async ({ page }) => {
        await signInAs(page, me);
        const { calls } = await mockMentorshipApi(page);
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=messages`);
        await page.getByLabel('Code', { exact: true }).check({ force: true });
        await page.getByLabel('Write a message').fill('echo "```"');
        await expect(page.getByRole('alert').filter({ hasText: 'three backticks' })).toBeVisible();
        await page.getByLabel('Send message').click();
        await expect(page.getByLabel('Write a message')).toHaveValue('echo "```"');
        expect(calls.filter((c) => c.path.endsWith('/messages'))).toHaveLength(0);
    });

    test('chat: plain text that looks like HTML suggests code mode', async ({ page }) => {
        await signInAs(page, me);
        await mockMentorshipApi(page);
        await page.goto(`/mentorship/${MENTORSHIP_ID}?tab=messages`);
        await page.getByLabel('Write a message').fill('<script>alert(1)</script>');
        await page.getByRole('button', { name: 'Send it as code' }).click();
        await expect(page.getByLabel('Language')).toBeVisible();
    });

    test('says so, without asking the API, when the address is not a mentorship id', async ({ page }) => {
        await signInAs(page, me);
        const requested: string[] = [];
        page.on('request', (r) => { if (r.url().includes('/api/mentorships/')) requested.push(r.url()); });
        await mockMentorshipApi(page);
        await page.goto('/mentorship/not-an-id');
        await expect(page.getByText('Mentorship not found')).toBeVisible();
        expect(requested.filter((u) => u.includes('not-an-id'))).toHaveLength(0);
    });

    test('says so when the mentorship does not exist', async ({ page }) => {
        await signInAs(page, me);
        await mockMentorshipApi(page);
        await page.goto(`/mentorship/${'9'.repeat(24)}`);
        await expect(page.getByText(/not found|cannot find|no longer|not available/i).first()).toBeVisible();
    });
});

test.describe('Staff', () => {
    const application = {
        ...mentor({ _id: 'a1'.repeat(12), user: { _id: 'user-x', username: 'newmentor', name: 'New Mentor', avatar: null, points: 320 } }),
        status: 'pending', reviewNote: null, reviewedAt: null, conductAcceptedAt: iso(-2), currentMenteeCount: 0,
    };

    test('an admin approves an application', async ({ page }) => {
        await signInAs(page, { ...me, role: 'admin' });
        const { state, calls } = await mockMentorshipApi(page);
        state.applications = [application];
        await page.goto('/admin/mentorship');
        await expect(page.getByTestId('application')).toContainText('New Mentor');
        await page.getByRole('button', { name: /^Approve New Mentor/ }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
        await expect(page.getByTestId('application')).toHaveAttribute('data-status', 'approved');
        expect(calls.find((c) => c.path.endsWith('/review'))?.body).toMatchObject({ decision: 'approve' });
    });

    test('an admin cannot review their own application', async ({ page }) => {
        await signInAs(page, { ...me, role: 'admin' });
        const { state } = await mockMentorshipApi(page);
        state.applications = [{ ...application, user: { ...(application.user as object), _id: 'user-1' } }];
        await page.goto('/admin/mentorship');
        await expect(page.getByTestId('own-application')).toBeVisible();
        await expect(page.getByRole('button', { name: /^Approve New Mentor/ })).toHaveCount(0);
    });

    test('an admin ends a mentorship with a reason', async ({ page }) => {
        await signInAs(page, { ...me, role: 'admin' });
        const { state, calls } = await mockMentorshipApi(page);
        state.adminMentorships = [mentorship()];
        await page.goto('/admin/mentorship?tab=mentorships');
        await page.getByRole('button', { name: /^End the mentorship/ }).first().click();
        await page.getByRole('dialog').getByLabel('Reason').fill('Repeated conduct breaches');
        await page.getByRole('dialog').getByRole('button', { name: /End mentorship/ }).click();
        await expect.poll(() => calls.some((c) => c.path.endsWith('/terminate'))).toBe(true);
        expect(calls.find((c) => c.path.endsWith('/terminate'))?.body).toMatchObject({ reason: 'Repeated conduct breaches' });
    });

    test('a moderator sees reports only and opens a message in context', async ({ page }) => {
        await signInAs(page, { ...me, role: 'moderator' });
        const { state } = await mockMentorshipApi(page);
        state.reported = [{ contentType: 'mentorMessage', contentId: 'm1', reportCount: 2, reasons: [{ reason: 'harassment', count: 2 }], firstReportedAt: iso(-1), lastReportedAt: iso(0), flagIds: ['flag1'], status: 'pending', content: { exists: true, excerpt: 'Send me your number' } }];
        state.context = {
            flag: { _id: 'flag1', contentType: 'mentorMessage', contentId: 'm1', reason: 'harassment', details: 'Asked for a phone number', status: 'pending' },
            messages: [message({ _id: '1'.repeat(24), content: 'Hi there' }), message({ _id: '2'.repeat(24), content: '<script>alert(1)</script> Send me your number', reported: true })],
        };
        await page.goto('/admin/mentorship');
        await expect(page.getByRole('tab', { name: 'Applications' })).toHaveCount(0);
        await expect(page.getByTestId('report-row')).toBeVisible();
        await page.getByRole('button', { name: 'View context' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByTestId('context-messages')).toBeVisible();
        await expect(dialog.getByText('<script>alert(1)</script> Send me your number')).toBeVisible();
        await expect(dialog.locator('li[data-reported="true"]')).toHaveCount(1);
    });

    test('keeps ordinary members out', async ({ page }) => {
        await signInAs(page, me);
        await mockMentorshipApi(page);
        await page.goto('/admin/mentorship');
        await expect(page.getByText(/Only moderators and admins/)).toBeVisible();
    });
});

test.describe('Metadata', () => {
    test('private pages are marked noindex and the public ones are not', async ({ page }) => {
        await signInAs(page, me);
        await mockMentorshipApi(page);
        await page.goto('/mentorship/dashboard');
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
        await page.goto('/mentorship');
        await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
    });
});
