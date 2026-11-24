import { describe, it, expect } from 'vitest';
import {
    buildCreatePayload, buildUpdatePayload, emptyCohort, fromCohort, fromLocalInput, parseLines, rowKey, toLocalInput, validateCohort,
    type CohortFormValues,
} from '../form';
import { FIXED_NOW, makeCohort, QUESTION_PICK, QUESTION_TEXT } from './fixtures';

const NOW = FIXED_NOW;
const valid = (over: Partial<CohortFormValues> = {}): CohortFormValues => ({
    ...emptyCohort(),
    title: 'Winter Internship',
    description: 'A program.',
    applicationDeadline: '2026-12-20T12:00',
    startDate: '2026-12-28T09:00',
    endDate: '2027-02-28T17:00',
    ...over,
});

describe('dates', () => {
    it('round-trips a local input value through an instant', () => {
        const local = '2026-12-20T12:30';
        expect(toLocalInput(fromLocalInput(local))).toBe(local);
        expect(fromLocalInput('')).toBe('');
        expect(fromLocalInput('nonsense')).toBe('');
        expect(toLocalInput(null)).toBe('');
    });
});

describe('validateCohort', () => {
    it('accepts a complete draft', () => {
        expect(validateCohort(valid(), { now: NOW })).toEqual({});
    });

    it('requires the title, the description and the three dates', () => {
        const errors = validateCohort(emptyCohort(), { now: NOW });
        expect(errors.title).toMatch(/at least 3/);
        expect(errors.description).toMatch(/required/);
        expect(errors.applicationDeadline).toMatch(/required/);
        expect(errors.startDate).toMatch(/required/);
        expect(errors.endDate).toMatch(/required/);
    });

    it('orders the dates like the API: deadline <= start < end', () => {
        expect(validateCohort(valid({ applicationDeadline: '2026-12-28T09:00' }), { now: NOW })).toEqual({});
        expect(validateCohort(valid({ applicationDeadline: '2026-12-28T09:01' }), { now: NOW }).applicationDeadline).toMatch(/on or before the start/);
        expect(validateCohort(valid({ endDate: '2026-12-28T09:00' }), { now: NOW }).endDate).toMatch(/after the start/);
        expect(validateCohort(valid({ endDate: '2026-12-01T09:00' }), { now: NOW }).endDate).toMatch(/after the start/);
    });

    it('needs a future deadline to open a new cohort', () => {
        const past = valid({ status: 'open', applicationDeadline: '2026-11-30T10:00', startDate: '2026-12-02T09:00' });
        expect(validateCohort(past, { now: NOW }).applicationDeadline).toMatch(/future/);
        expect(validateCohort({ ...past, status: 'draft' }, { now: NOW }).applicationDeadline).toBeUndefined();
    });

    it('asks for the future deadline on an edit only when the status is changed to open', () => {
        const initial = valid({ status: 'open', applicationDeadline: '2026-11-30T10:00', startDate: '2026-12-02T09:00' });
        expect(validateCohort({ ...initial, title: 'Renamed' }, { now: NOW, initial }).applicationDeadline).toBeUndefined();
        const closed = { ...initial, status: 'closed' as const };
        expect(validateCohort({ ...closed, status: 'open' }, { now: NOW, initial: closed }).applicationDeadline).toMatch(/future/);
    });

    it('treats capacity 0 as no limit and rejects negatives, fractions and text', () => {
        expect(validateCohort(valid({ capacity: '0' }), { now: NOW }).capacity).toBeUndefined();
        expect(validateCohort(valid({ capacity: '-1' }), { now: NOW }).capacity).toBeDefined();
        expect(validateCohort(valid({ capacity: '2.5' }), { now: NOW }).capacity).toBeDefined();
        expect(validateCohort(valid({ capacity: '' }), { now: NOW }).capacity).toBeDefined();
        expect(validateCohort(valid({ capacity: '10001' }), { now: NOW }).capacity).toMatch(/10000/);
    });

    it('will not lower the capacity under the accepted applicants', () => {
        expect(validateCohort(valid({ capacity: '3' }), { now: NOW, acceptedCount: 5 }).capacity).toMatch(/5 applicants/);
        expect(validateCohort(valid({ capacity: '0' }), { now: NOW, acceptedCount: 5 }).capacity).toBeUndefined();
        expect(validateCohort(valid({ capacity: '5' }), { now: NOW, acceptedCount: 5 }).capacity).toBeUndefined();
    });

    it('holds the lists to the API limits, keyed by their field', () => {
        const many = Array.from({ length: 21 }, (_, i) => `item ${i}`).join('\n');
        expect(validateCohort(valid({ requirements: many }), { now: NOW }).requirements).toMatch(/At most 20/);
        expect(validateCohort(valid({ technologies: 'x'.repeat(51) }), { now: NOW }).technologies).toMatch(/50/);
    });

    it('checks the questions: a label, dropdown options, no duplicates', () => {
        const q = (over: object) => ({ key: rowKey(), label: 'Track', type: 'dropdown' as const, options: ['A'], required: false, ...over });
        expect(validateCohort(valid({ customFields: [q({ label: '' })] }), { now: NOW })['customFields.0.label']).toBeDefined();
        expect(validateCohort(valid({ customFields: [q({ options: [] })] }), { now: NOW })['customFields.0.options']).toMatch(/at least one/);
        expect(validateCohort(valid({ customFields: [q({ options: ['A', ' ', ''] })] }), { now: NOW })).toEqual({});
        expect(validateCohort(valid({ customFields: [q({ options: ['A', 'A'] })] }), { now: NOW })['customFields.0.options']).toMatch(/different/);
        expect(validateCohort(valid({ customFields: [q({ _id: 'x'.repeat(24) }), q({ _id: 'x'.repeat(24) })] }), { now: NOW })['customFields.1']).toMatch(/twice/);
        const many = Array.from({ length: 21 }, () => q({}));
        expect(validateCohort(valid({ customFields: many }), { now: NOW }).customFields).toMatch(/At most 20/);
    });

    it('checks the curriculum: week range, title, no repeated week, at most 52', () => {
        const w = (over: object) => ({ key: rowKey(), week: '1', title: 'Intro', description: '', topics: '', deliverables: '', ...over });
        expect(validateCohort(valid({ syllabus: [w({ week: '0' })] }), { now: NOW })['syllabus.0.week']).toBeDefined();
        expect(validateCohort(valid({ syllabus: [w({ week: '53' })] }), { now: NOW })['syllabus.0.week']).toBeDefined();
        expect(validateCohort(valid({ syllabus: [w({ title: '' })] }), { now: NOW })['syllabus.0.title']).toBeDefined();
        expect(validateCohort(valid({ syllabus: [w({}), w({})] }), { now: NOW })['syllabus.1.week']).toMatch(/already/);
        expect(validateCohort(valid({ syllabus: Array.from({ length: 53 }, (_, i) => w({ week: String((i % 52) + 1) })) }), { now: NOW }).syllabus).toMatch(/At most 52/);
    });

    it('allows showcase links only when they are public http(s)', () => {
        const p = (over: object) => ({ key: rowKey(), title: 'Scanner', description: '', teamMembers: '', demoLink: '', repoLink: '', image: '', ...over });
        expect(validateCohort(valid({ showcaseProjects: [p({ demoLink: 'javascript:alert(1)' })] }), { now: NOW })['showcaseProjects.0.demoLink']).toBeDefined();
        expect(validateCohort(valid({ showcaseProjects: [p({ repoLink: 'http://localhost/x' })] }), { now: NOW })['showcaseProjects.0.repoLink']).toBeDefined();
        expect(validateCohort(valid({ showcaseProjects: [p({ demoLink: 'https://demo.example.org', repoLink: 'https://github.com/a/b' })] }), { now: NOW })).toEqual({});
    });
});

describe('create payload', () => {
    it('sends the instants, numbers and lists the API expects, and no isActive', () => {
        const payload = buildCreatePayload(valid({
            capacity: '12', status: 'open', requirements: ' a \n\n b ', technologies: 'Python\nBurp',
            customFields: [
                { key: 'k1', label: ' Track ', type: 'dropdown', options: ['A', ' ', 'B'], required: true },
                { key: 'k2', label: 'About you', type: 'textarea', options: ['stale'], required: false },
            ],
        }));
        expect(payload).toMatchObject({
            title: 'Winter Internship', type: 'internship', status: 'open', capacity: 12, requirements: ['a', 'b'], technologies: ['Python', 'Burp'],
            startDate: new Date('2026-12-28T09:00').toISOString(),
        });
        expect(payload).not.toHaveProperty('isActive');
        expect(payload.customFields).toEqual([
            { label: 'Track', type: 'dropdown', options: ['A', 'B'], required: true },
            { label: 'About you', type: 'textarea', required: false },
        ]);
    });
});

describe('edit payload', () => {
    const loaded = () => makeCohort({ storedStatus: 'open', isActive: true, acceptedCount: 2, applicationCount: 5 });

    it('sends nothing when nothing changed', () => {
        const initial = fromCohort(loaded());
        expect(buildUpdatePayload(initial, { ...initial })).toEqual({});
    });

    it('sends only the fields that changed', () => {
        const initial = fromCohort(loaded());
        expect(buildUpdatePayload(initial, { ...initial, title: 'New title', capacity: '20' })).toEqual({ title: 'New title', capacity: 20 });
    });

    it('sends a date only when it was edited, and as an instant', () => {
        const initial = fromCohort(loaded());
        const payload = buildUpdatePayload(initial, { ...initial, applicationDeadline: '2027-01-05T10:00', startDate: '2027-01-10T10:00' });
        expect(Object.keys(payload).sort()).toEqual(['applicationDeadline', 'startDate']);
        expect(payload.applicationDeadline).toBe(new Date('2027-01-05T10:00').toISOString());
    });

    it('reads the stored status, not the computed one', () => {
        const initial = fromCohort(makeCohort({ status: 'closed', storedStatus: 'open' }));
        expect(initial.status).toBe('open');
    });

    it('keeps the id of each question that exists and leaves new ones without one', () => {
        const initial = fromCohort(loaded());
        const next = { ...initial, customFields: [...initial.customFields, { key: rowKey(), label: 'Anything else?', type: 'text' as const, options: [], required: false }] };
        const sent = buildUpdatePayload(initial, next).customFields ?? [];
        expect(sent).toHaveLength(5);
        expect(sent.slice(0, 4).map((f) => f._id)).toEqual(initial.customFields.map((f) => f._id));
        expect(sent[4]).not.toHaveProperty('_id');
        expect(sent[4].label).toBe('Anything else?');
    });

    it('keeps ids stable when questions are reordered or edited', () => {
        const initial = fromCohort(loaded());
        const reordered = [initial.customFields[2], ...initial.customFields.filter((_, i) => i !== 2)].map((f, i) => (i === 0 ? { ...f, label: 'Track?' } : f));
        const sent = buildUpdatePayload(initial, { ...initial, customFields: reordered }).customFields ?? [];
        expect(sent[0]).toMatchObject({ _id: QUESTION_PICK, label: 'Track?', type: 'dropdown', options: ['Offensive', 'Defensive'] });
        expect(sent[1]._id).toBe(QUESTION_TEXT);
        expect(new Set(sent.map((f) => f._id)).size).toBe(4);
    });

    it('can switch the program off and move it to any status', () => {
        const initial = fromCohort(loaded());
        expect(buildUpdatePayload(initial, { ...initial, isActive: false, status: 'in-progress' })).toEqual({ isActive: false, status: 'in-progress' });
    });

    it('keeps the image of a showcase project that the form does not edit', () => {
        const initial = fromCohort(loaded());
        const withProject = { ...initial, showcaseProjects: [{ key: rowKey(), title: 'Scanner', description: '', teamMembers: 'Ada\nGrace', demoLink: '', repoLink: 'https://github.com/a/b', image: 'https://example.org/i.png' }] };
        const sent = buildUpdatePayload(initial, withProject).showcaseProjects ?? [];
        expect(sent[0]).toEqual({ title: 'Scanner', description: '', teamMembers: ['Ada', 'Grace'], repoLink: 'https://github.com/a/b', image: 'https://example.org/i.png' });
    });
});

describe('parseLines', () => {
    it('drops blank lines and trims', () => {
        expect(parseLines(' a \r\n\r\n b\n  ')).toEqual(['a', 'b']);
    });
});
