import type { EventDetail } from '@/types/event';
import { effectiveStatus, formatStart } from './time';

/**
 * What the registration panel offers, decided from the viewer block the API sent. The buttons never
 * guess: `canRegister` and `canJoinWaitlist` come from the server, which knows the deadline, the
 * capacity and the state of the event.
 */
export type RegistrationView =
    | { kind: 'cancelled'; reason: string | null }
    | { kind: 'ended'; registered: boolean; attended: boolean }
    | { kind: 'loading' }
    | { kind: 'guest'; open: boolean; reason: string | null }
    | { kind: 'registered'; attended: boolean }
    | { kind: 'waitlisted'; position: number | null }
    | { kind: 'can-register' }
    | { kind: 'can-waitlist' }
    | { kind: 'closed'; reason: string };

export function closedReason(event: EventDetail, now: Date): string {
    const status = effectiveStatus(event, now);
    if (status === 'ended') return 'This event is over.';
    if (event.rsvpEnabled === false) return 'This event does not use registration here.';
    if (event.rsvpDeadline && new Date(event.rsvpDeadline) <= now) {
        return `Registration closed on ${formatStart({ startDate: event.rsvpDeadline }, event.timezone)}.`;
    }
    if (event.isFull && !event.waitlistEnabled) return 'This event is full and has no waiting list.';
    if (status === 'live') return 'This event has started, so registration is closed.';
    return 'Registration is closed.';
}

export function registrationView(
    event: EventDetail,
    { signedIn, authLoading, now }: { signedIn: boolean; authLoading: boolean; now: Date },
): RegistrationView {
    const status = effectiveStatus(event, now);
    if (status === 'cancelled') return { kind: 'cancelled', reason: event.cancelReason ?? null };

    const viewer = event.viewer;
    if (status === 'ended') return { kind: 'ended', registered: !!viewer?.registered, attended: !!viewer?.attended };

    if (!signedIn) {
        if (authLoading) return { kind: 'loading' };
        // A signed-out visitor can be told what to expect, but only the server can say who may register
        const reason = event.rsvpEnabled === false || (event.rsvpDeadline && new Date(event.rsvpDeadline) <= now) || (event.isFull && !event.waitlistEnabled)
            ? closedReason(event, now)
            : null;
        return { kind: 'guest', open: reason === null, reason };
    }
    // Signed in, but the viewer block has not arrived yet
    if (!viewer) return { kind: 'loading' };

    if (viewer.registered) return { kind: 'registered', attended: viewer.attended };
    if (viewer.waitlisted) return { kind: 'waitlisted', position: viewer.position };
    // A full event never offers a plain register button, whichever flag the server set: the waiting
    // list when it has one and the viewer may use it, otherwise nothing
    if (event.isFull) {
        if (event.waitlistEnabled && (viewer.canJoinWaitlist || viewer.canRegister)) return { kind: 'can-waitlist' };
        return { kind: 'closed', reason: closedReason(event, now) };
    }
    if (viewer.canRegister) return { kind: 'can-register' };
    if (viewer.canJoinWaitlist) return { kind: 'can-waitlist' };
    return { kind: 'closed', reason: closedReason(event, now) };
}
