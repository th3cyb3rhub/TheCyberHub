import { ApiError } from '@/lib/api';

/**
 * What a person should read for each error the events API can answer with. The server message is
 * the fallback, so a new code never shows a blank toast.
 */
const MESSAGES: Record<string, string> = {
    EVENT_REGISTRATION_CLOSED: 'Registration for this event is closed.',
    EVENT_FULL: 'This event is full and has no waiting list.',
    EVENT_ALREADY_REGISTERED: 'You are already registered for this event.',
    EVENT_ALREADY_WAITLISTED: 'You are already on the waiting list.',
    EVENT_NOT_REGISTERED: 'You are not registered for this event.',
    EVENT_NOT_FULL: 'A seat is free, so you can register instead of waiting.',
    EVENT_WAITLIST_DISABLED: 'This event has no waiting list.',
    EVENT_NOT_WAITLISTED: 'You are not on the waiting list.',
    EVENT_REMINDER_UNAVAILABLE: 'That reminder time has already passed.',
    EVENT_ENDED: 'This event is already over.',
    EVENT_ALREADY_ATTENDED: 'Your attendance is already recorded, so you cannot cancel.',
    EVENT_CANCELLED: 'This event was cancelled.',
    EVENT_NOT_CANCELLABLE: 'This event cannot be cancelled any more.',
    EVENT_NOT_PENDING: 'This event is no longer waiting for review. Someone else may have reviewed it.',
    EVENT_NOT_OPEN: 'Attendance cannot be recorded for this event.',
    EVENT_NOT_STARTED: 'Attendance can be recorded once the event has started.',
    EVENT_EMAIL_NOT_VERIFIED: 'Verify your email address to submit an event.',
    EVENT_PENDING_LIMIT: 'You already have 3 events waiting for review. Wait for a decision before sending another.',
    EVENT_DAILY_LIMIT: 'You have reached the limit of 5 submissions in 24 hours. Try again tomorrow.',
    EVENT_DUPLICATE: 'An event with this title at about the same time was already submitted.',
    EVENT_FIELD_LOCKED: 'That field can no longer be changed because the event is public.',
    EVENT_FEEDBACK_CLOSED: 'Feedback opens when the event is over.',
    EVENT_FEEDBACK_EXISTS: 'You have already left feedback for this event.',
    EVENT_FEEDBACK_FORBIDDEN: 'Only people who registered can leave feedback.',
    AUTHZ_FORBIDDEN: 'You are not allowed to do that.',
    SERIES_NOT_FOUND: 'This series could not be found. It may have been removed.',
    SERIES_ENDED: 'This series has ended, so it cannot be changed.',
    SERIES_LIMIT: 'You already have 20 running series. End one before you create another.',
    SERIES_OCCURRENCE_EXISTS: 'Another occurrence of this series already starts at that time.',
    EVENT_NOT_EDITABLE: 'That occurrence is over or cancelled, so it cannot be edited.',
};

const NOT_FOUND = 'This event could not be found. It may have been removed.';

export function eventErrorCode(err: unknown): string | undefined {
    return err instanceof ApiError ? err.code : undefined;
}

/** The message to show for a failed events call */
export function eventErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
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

/** Field level problems from a 400, keyed by the API field name (`startDate`, `speakers.0.name`) */
export function fieldErrors(err: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (err instanceof ApiError && err.details) {
        for (const d of err.details) {
            if (d.field && !out[d.field]) out[d.field] = d.message;
        }
    }
    return out;
}

/** Whether the error means "sign in again" rather than "you may not" */
export function isAuthError(err: unknown): boolean {
    return err instanceof ApiError && err.status === 401;
}

/** The attendee export: a 403 is about the organizer role, not about the member being signed out */
export function exportErrorMessage(err: unknown): string {
    if (err instanceof ApiError && err.status === 403) return 'Only the organizer of this event and administrators can export the attendee list.';
    if (err instanceof ApiError && err.status === 401) return 'Sign in again to export the attendee list.';
    return eventErrorMessage(err, 'Could not export the attendee list. Please try again.');
}

/** Calendar feed calls: the same words for any failure, without hints about the address */
export function calendarFeedErrorMessage(err: unknown): string {
    if (err instanceof ApiError && err.status === 401) return 'Sign in again to manage your calendar feed.';
    return eventErrorMessage(err, 'Could not update your calendar feed. Please try again.');
}
