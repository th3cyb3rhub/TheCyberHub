import { ApiError } from '@/lib/api';

/**
 * What a person should read for each error the mentorship API can answer with. The server message
 * is the fallback, so a new code never shows a blank toast.
 */
const MESSAGES: Record<string, string> = {
    MENTOR_NOT_ELIGIBLE: 'You need more points to apply as a mentor, or an invitation from the team.',
    MENTOR_EMAIL_NOT_VERIFIED: 'Verify your email address before applying as a mentor.',
    MENTORSHIP_EMAIL_NOT_VERIFIED: 'Verify your email address before asking for a mentor.',
    MENTOR_ALREADY_REGISTERED: 'You already have a mentor profile.',
    MENTOR_UNAVAILABLE: 'This mentor is not taking new mentees right now.',
    MENTOR_AT_CAPACITY: 'This mentor has no free spot right now.',
    MENTOR_COOLDOWN: 'This mentor declined recently. You can ask them again after 7 days.',
    MENTOR_INBOX_FULL: 'This mentor has many requests waiting. Try again later or choose another mentor.',
    MENTOR_PAIR_BLOCKED: 'You cannot request this mentor.',
    MENTOR_MAX_BELOW_CURRENT: 'You cannot take fewer mentees than you already have.',
    MENTOR_REVIEW_CONFLICT: 'Someone else already reviewed this application. Reload to see the result.',
    OWN_PROFILE: 'You cannot request yourself as a mentor.',
    REQUEST_OPEN_EXISTS: 'You already have an open mentorship request. Cancel it or wait for an answer first.',
    REQUEST_DAILY_LIMIT: 'You can send 5 requests in 24 hours. Try again tomorrow.',
    REQUEST_NOT_OPEN: 'This request is no longer open. It may have been answered or have expired.',
    REQUEST_INVITE_LIMIT: 'You have already invited the most mentors a request can have (5).',
    MENTOR_ALREADY_INVITED: 'You already invited this mentor.',
    MENTEE_LIMIT_REACHED: 'You can be in at most 2 mentorships at once.',
    MENTORSHIP_EXISTS: 'You already have an open mentorship with this person.',
    MENTORSHIP_NOT_ACTIVE: 'This mentorship is not active, so that is not possible right now.',
    MENTORSHIP_EXTEND_LIMIT: 'A mentorship can last 6 months in all, so it cannot be extended any further.',
    MENTORSHIP_TERM_ENDED: 'The term of this mentorship has ended.',
    MENTORSHIP_NOT_COMPLETED: 'Final feedback opens once the mentorship is completed.',
    SESSION_TOO_SOON: 'A session must start at least 5 minutes from now.',
    SESSION_TOO_FAR: 'A session cannot be more than 90 days ahead.',
    SESSION_OVERLAP: 'Another session is already scheduled at that time.',
    SESSION_LIMIT_REACHED: 'At most 5 sessions can be scheduled at once. Complete or cancel one first.',
    SESSION_AFTER_TERM: 'The session must end before the mentorship term ends. Extend the mentorship first.',
    SESSION_NOT_STARTED: 'A session can be marked as held once it has started.',
    SESSION_STARTED: 'This session has already started, so it cannot be moved.',
    SESSION_NOT_COMPLETED: 'Feedback opens once the session is marked as held.',
    SESSION_MENTOR_ONLY: 'Only the mentor can mark a session as held.',
    SESSION_TIMEZONE_INVALID: 'Pick a valid time zone.',
    SESSION_TIME_INVALID: 'The session time is not a valid date and time.',
    FEEDBACK_ALREADY_SUBMITTED: 'You have already left feedback here.',
    FEEDBACK_DEADLINE_PASSED: 'The time to leave feedback has passed.',
    ALREADY_REPORTED: 'You have already reported this. Our team will take a look.',
    REPORT_OWN_CONTENT: 'You cannot report your own message.',
    ATTACHMENT_URL_INVALID: 'That file could not be attached. Upload it again.',
    ATTACHMENT_TYPE_INVALID: 'This file type is not allowed. Use an image, PDF, Word or text file.',
    ATTACHMENT_TOO_LARGE: 'The file is too large. The limit is 5 MB.',
    ATTACHMENT_NAME_INVALID: 'The file needs a name.',
    MESSAGE_TOO_LONG: 'The message is too long (5000 characters at most).',
    MESSAGE_EMPTY: 'A message cannot be empty.',
    USER_MUTED: 'Your account is muted, so you cannot do that right now.',
    ACCOUNT_UNAVAILABLE: 'Your account cannot do that right now.',
    TRANSACTIONS_UNAVAILABLE: 'The service is temporarily unavailable. Please try again later.',
    FLAG_CLOSED: 'This report was already handled by another moderator.',
    MENTEE_UNAVAILABLE: 'This member cannot take part in a mentorship right now.',
    SESSION_CHANGED: 'This session changed while you were editing it. Reload and try again.',
    SESSION_NOT_SCHEDULED: 'This session was already held or cancelled, so it cannot be changed.',
    MENTORSHIP_STATE_CONFLICT: 'This mentorship changed in the meantime. Reload the page and try again.',
    REQUEST_STILL_OPEN: 'This request is still open, so it does not need to be renewed.',
    MENTOR_SUSPENDED: 'Your mentor profile is suspended. Contact the team to find out more.',
    AUTHZ_FORBIDDEN: 'You are not allowed to do that.',
};

const NOT_FOUND = 'We could not find that. It may have been removed, or it may not be yours to open.';

export function mentorshipErrorCode(err: unknown): string | undefined {
    return err instanceof ApiError ? err.code : undefined;
}

/** The message to show for a failed mentorship call */
export function mentorshipErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (err instanceof ApiError) {
        if (err.code && MESSAGES[err.code]) return MESSAGES[err.code];
        if (err.status === 401) return 'Sign in to do that.';
        if (err.status === 404) return NOT_FOUND;
        if (err.status === 429) return 'You are doing that too quickly. Please wait a minute and try again.';
        if (err.code === 'VALIDATION_ERROR' && err.details?.length) return err.details.map((d) => d.message).join(' ');
        return err.message || fallback;
    }
    return err instanceof Error && err.message ? err.message : fallback;
}

/** A 404 means "not found or not yours" for every participant-only object, so pages show one calm state */
export function isNotFound(err: unknown): boolean {
    return err instanceof ApiError && err.status === 404;
}

export function isForbidden(err: unknown): boolean {
    return err instanceof ApiError && err.status === 403;
}
