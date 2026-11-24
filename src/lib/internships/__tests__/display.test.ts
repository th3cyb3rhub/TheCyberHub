import { describe, it, expect } from 'vitest';
import { applyView, excerpt, formatMoment, hostOf, safeHref, spotsInfo } from '../display';
import { makeCohort, viewer } from './fixtures';

describe('apply panel state', () => {
    it('sends an anonymous visitor to sign in while applications are open', () => {
        expect(applyView(makeCohort({ viewer: null })).state).toBe('anonymous');
    });

    it('lets a signed-in member apply when the API says so', () => {
        expect(applyView(makeCohort()).state).toBe('can-apply');
    });

    it('shows the application of someone who applied, whatever its status', () => {
        for (const status of ['pending', 'accepted', 'withdrawn'] as const) {
            const v = viewer({ canApply: false, userApplication: { _id: 'x', status, appliedAt: 'a', updatedAt: 'b' } });
            expect(applyView(makeCohort({ viewer: v })).state).toBe('applied');
        }
    });

    it('says closed once applications are over, with the reason for each state', () => {
        expect(applyView(makeCohort({ applicationsOpen: false, status: 'closed' }))).toMatchObject({ state: 'closed', reason: expect.stringMatching(/closed/) });
        expect(applyView(makeCohort({ applicationsOpen: false, status: 'in-progress' })).reason).toMatch(/started/);
        expect(applyView(makeCohort({ applicationsOpen: false, status: 'completed' })).reason).toMatch(/over/);
    });

    it('says full when no seat is left, and does not offer to apply', () => {
        const view = applyView(makeCohort({ spotsLeft: 0 }));
        expect(view.state).toBe('full');
        expect(view.reason).toMatch(/seat/);
    });

    it('is closed for a member whom the API says cannot apply', () => {
        expect(applyView(makeCohort({ viewer: viewer({ canApply: false }) })).state).toBe('closed');
    });
});

describe('spots', () => {
    it('is unlimited without a capacity', () => {
        expect(spotsInfo({ capacity: 0, spotsLeft: null })).toEqual({ label: null, full: false, unlimited: true });
    });
    it('counts seats and speaks in the singular', () => {
        expect(spotsInfo({ capacity: 10, spotsLeft: 4 }).label).toBe('4 of 10 spots left');
        expect(spotsInfo({ capacity: 10, spotsLeft: 1 }).label).toBe('1 of 10 spot left');
        expect(spotsInfo({ capacity: 10, spotsLeft: 0 })).toMatchObject({ full: true, label: 'No spots left' });
    });
});

describe('dates in the viewer zone', () => {
    it('names the zone and converts the instant', () => {
        expect(formatMoment('2026-12-20T12:00:00.000Z', 'America/New_York')).toBe('Dec 20, 2026, 7:00 AM EST');
        expect(formatMoment('2026-12-20T12:00:00.000Z', null)).toBe('Dec 20, 2026, 12:00 PM UTC');
        expect(formatMoment('garbage', 'UTC')).toBe('');
    });
    it('falls back to UTC for a zone it does not know', () => {
        expect(formatMoment('2026-12-20T12:00:00.000Z', 'Not/AZone')).toContain('UTC');
    });
});

describe('text and links', () => {
    it('keeps only http(s) links', () => {
        expect(safeHref('https://example.org/a')).toBe('https://example.org/a');
        expect(safeHref('javascript:alert(1)')).toBeNull();
        expect(safeHref('data:text/html,x')).toBeNull();
        expect(safeHref(null)).toBeNull();
        expect(hostOf('https://www.example.org/x?y=1')).toBe('example.org');
    });
    it('strips markup and shortens', () => {
        expect(excerpt('<b>Hello</b>   <script>x</script> world', 100)).toBe('Hello x world');
        expect(excerpt('a'.repeat(50), 10)).toHaveLength(10);
    });
});
