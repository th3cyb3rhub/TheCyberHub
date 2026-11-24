import { describe, it, expect } from 'vitest';
import {
    canWithdraw, cohortIsFull, confirmCopy, FULL_REASON, isFinal, progressSteps, reviewActions, SELF_REVIEW_REASON, STAFF_TRANSITIONS, timelineItems,
} from '../review';

describe('transition buttons', () => {
    it('offers exactly the moves the API allows, in order', () => {
        expect(reviewActions({ status: 'pending', own: false, cohortFull: false }).map((a) => a.to)).toEqual(['reviewing', 'accepted', 'rejected']);
        expect(reviewActions({ status: 'reviewing', own: false, cohortFull: false }).map((a) => a.to)).toEqual(['accepted', 'rejected']);
    });

    it('offers nothing for a final or withdrawn application', () => {
        for (const status of ['accepted', 'rejected', 'withdrawn'] as const) {
            expect(reviewActions({ status, own: false, cohortFull: false })).toEqual([]);
            expect(isFinal(status)).toBe(true);
        }
        expect(isFinal('pending')).toBe(false);
    });

    it('never offers withdrawn, or a move back, to staff', () => {
        for (const from of Object.keys(STAFF_TRANSITIONS) as (keyof typeof STAFF_TRANSITIONS)[]) {
            expect(STAFF_TRANSITIONS[from]).not.toContain('withdrawn');
            expect(STAFF_TRANSITIONS[from]).not.toContain('pending');
        }
    });

    it('shows every move but off, with the reason, for your own application', () => {
        const actions = reviewActions({ status: 'pending', own: true, cohortFull: false });
        expect(actions).toHaveLength(3);
        expect(actions.every((a) => !a.enabled && a.reason === SELF_REVIEW_REASON)).toBe(true);
    });

    it('turns acceptance off in a full cohort but keeps rejecting available', () => {
        const actions = reviewActions({ status: 'reviewing', own: false, cohortFull: true });
        expect(actions.find((a) => a.to === 'accepted')).toMatchObject({ enabled: false, reason: FULL_REASON });
        expect(actions.find((a) => a.to === 'rejected')).toMatchObject({ enabled: true });
    });

    it('knows when a cohort has no seat left', () => {
        expect(cohortIsFull({ capacity: 5, acceptedCount: 5 })).toBe(true);
        expect(cohortIsFull({ capacity: 5, acceptedCount: 4 })).toBe(false);
        expect(cohortIsFull({ capacity: 0, acceptedCount: 99 })).toBe(false);
        expect(cohortIsFull(null)).toBe(false);
    });

    it('words the confirmation for each decision', () => {
        expect(confirmCopy('accepted').button).toBe('Accept');
        expect(confirmCopy('rejected').body).toMatch(/cannot be undone/);
        expect(confirmCopy('reviewing').title).toMatch(/Start reviewing/);
    });

    it('lets the applicant withdraw until a rejection or an earlier withdrawal', () => {
        expect(['pending', 'reviewing', 'accepted'].every((s) => canWithdraw(s as never))).toBe(true);
        expect(canWithdraw('rejected')).toBe(false);
        expect(canWithdraw('withdrawn')).toBe(false);
    });
});

describe('application progress', () => {
    it('marks the step that is current and the ones before it as done', () => {
        expect(progressSteps('pending').map((s) => s.state)).toEqual(['current', 'upcoming', 'upcoming']);
        expect(progressSteps('reviewing').map((s) => s.state)).toEqual(['done', 'current', 'upcoming']);
        expect(progressSteps('accepted').map((s) => s.state)).toEqual(['done', 'done', 'done']);
        expect(progressSteps('accepted')[2].label).toBe('Accepted');
        expect(progressSteps('rejected')[2].label).toBe('Not selected');
    });
});

describe('timeline', () => {
    it('keeps the order of the API and marks only the last entry as current', () => {
        const items = timelineItems([
            { status: 'pending', at: '2026-12-01T10:00:00.000Z' },
            { status: 'reviewing', at: '2026-12-02T10:00:00.000Z', note: 'Reading your repo' },
            { status: 'accepted', at: '2026-12-03T10:00:00.000Z' },
        ], 'accepted');
        expect(items.map((i) => i.status)).toEqual(['pending', 'reviewing', 'accepted']);
        expect(items.map((i) => i.current)).toEqual([false, false, true]);
        expect(items[1]).toMatchObject({ note: 'Reading your repo', noteBy: 'reviewer' });
    });

    it('treats the note on a withdrawal as the applicant own reason', () => {
        const [, last] = timelineItems([{ status: 'pending', at: 'a' }, { status: 'withdrawn', at: 'b', note: 'Found another offer' }], 'withdrawn');
        expect(last.noteBy).toBe('you');
    });

    it('is empty without a history', () => {
        expect(timelineItems(undefined)).toEqual([]);
        expect(timelineItems(null)).toEqual([]);
    });
});
