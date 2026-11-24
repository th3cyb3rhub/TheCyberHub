import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import {
    buildCreatePayload, buildUpdatePayload, clearPrizeErrors, emptyCompetition, formErrors, formFieldPath, fromCompetition, hasVisibleField, instantOf,
    nextPlace, revertLocked, scheduleNote, shiftZone, slugFromTitle, unattachedErrors, validateCompetition, type CtfFormValues,
} from '../form';
import { makeCompetition } from './fixtures';

const filled = (over: Partial<CtfFormValues> = {}): CtfFormValues => ({
    ...emptyCompetition('UTC'),
    title: 'Winter CTF', description: 'Solve things.',
    startDate: '2026-12-05', startTime: '10:00', endDate: '2026-12-07', endTime: '10:00',
    ...over,
});

const apiError = (code: string, details?: { field: string; message: string }[], meta?: Record<string, unknown>) =>
    new ApiError('Server words', 400, code, details, meta);

describe('create payload', () => {
    it('sends the required four and leaves blank optional fields out', () => {
        const payload = buildCreatePayload(filled());
        expect(payload.title).toBe('Winter CTF')
        expect(payload.description).toBe('Solve things.')
        expect(payload.startDate).toBe('2026-12-05T10:00:00.000Z')
        expect(payload.endDate).toBe('2026-12-07T10:00:00.000Z')
        expect(payload).not.toHaveProperty('slug')
        expect(payload).not.toHaveProperty('image')
        expect(payload).not.toHaveProperty('rules')
        expect(payload).not.toHaveProperty('frozenAt')
        expect(payload).not.toHaveProperty('prizes')
        expect(payload).not.toHaveProperty('challenges')
        expect(payload).not.toHaveProperty('minTeamSize')
        expect(payload.status).toBe('draft')
    })

    it('publishes as upcoming and lets the API work out live, frozen and ended from the dates', () => {
        expect(buildCreatePayload(filled({ status: 'published' })).status).toBe('upcoming')
    })

    it('reads the clock times in the chosen zone', () => {
        const payload = buildCreatePayload(filled({ timezone: 'Europe/Berlin' }));
        expect(payload.startDate).toBe('2026-12-05T09:00:00.000Z')
        expect(payload.timezone).toBe('Europe/Berlin')
    })

    it('sends prizes as { place, reward } in place order, trimmed', () => {
        const payload = buildCreatePayload(filled({
            prizes: [{ key: 'a', place: '2', reward: ' Hoodie ' }, { key: 'b', place: '1', reward: 'Key' }],
        }));
        expect(payload.prizes).toEqual([{ place: 1, reward: 'Key' }, { place: 2, reward: 'Hoodie' }])
    })

    it('sends team sizes only while teams are on, and the challenge ids as picked', () => {
        expect(buildCreatePayload(filled({ teamsEnabled: false, minTeamSize: '9' }))).not.toHaveProperty('minTeamSize')
        const teams = buildCreatePayload(filled({ teamsEnabled: true, minTeamSize: '2', maxTeamSize: '5', challenges: ['a', 'b'] }));
        expect(teams).toMatchObject({ teamsEnabled: true, minTeamSize: 2, maxTeamSize: 5, challenges: ['a', 'b'] })
    })

    it('never sends a field the API does not take', () => {
        const keys = Object.keys(buildCreatePayload(filled({ slug: 'x-ctf', image: 'https://example.com/a.png', rules: 'r', prizesNote: 'n', frozenDate: '2026-12-06', frozenTime: '10:00' })));
        const allowed = ['title', 'slug', 'description', 'shortDescription', 'image', 'rules', 'startDate', 'endDate', 'timezone', 'status', 'isPublic', 'isFeatured', 'teamsEnabled',
            'minTeamSize', 'maxTeamSize', 'challenges', 'scoringMode', 'prizes', 'prizesNote', 'registrationOpen', 'maxParticipants', 'awardsPoints', 'frozenAt'];
        expect(keys.filter((k) => !allowed.includes(k))).toEqual([])
    })
})

describe('update payload', () => {
    const competition = makeCompetition({ status: 'upcoming', isPublic: true, rules: 'Be kind.', startDate: '2026-12-05T10:00:30.000Z' });

    it('sends nothing for an untouched form, even when the stored times carry seconds', () => {
        const initial = fromCompetition(competition);
        expect(buildUpdatePayload(initial, { ...initial })).toEqual({})
    })

    it('sends only the fields that changed', () => {
        const initial = fromCompetition(competition);
        const payload = buildUpdatePayload(initial, { ...initial, title: 'Winter CTF 2', registrationOpen: false });
        expect(payload).toEqual({ title: 'Winter CTF 2', registrationOpen: false })
    })

    it('clears an optional field with null', () => {
        const initial = fromCompetition(makeCompetition({ image: 'https://example.com/a.png', rules: 'x' }));
        expect(buildUpdatePayload(initial, { ...initial, image: '', rules: '' })).toEqual({ image: null, rules: null })
    })

    it('sends a moved end as an ISO instant and leaves the start alone', () => {
        const initial = fromCompetition(competition);
        const payload = buildUpdatePayload(initial, { ...initial, endDate: '2026-12-08' });
        expect(payload.endDate).toBe('2026-12-08T10:00:00.000Z')
        expect(payload).not.toHaveProperty('startDate')
    })

    it('does not move the instants when only the zone is relabelled', () => {
        const initial = fromCompetition(competition);
        const shifted = shiftZone(initial, 'Asia/Tokyo');
        expect(shifted.timezone).toBe('Asia/Tokyo')
        expect(buildUpdatePayload(initial, shifted)).toEqual({ timezone: 'Asia/Tokyo' })
    })

    it('sends the whole prize list when one prize changes, and a published draft as upcoming', () => {
        const initial = fromCompetition(makeCompetition({ status: 'draft' }));
        const payload = buildUpdatePayload(initial, { ...initial, status: 'published', prizes: [{ key: 'z', place: '1', reward: 'A hardware key' }, { key: 'y', place: '2', reward: 'Stickers' }] });
        expect(payload.status).toBe('upcoming')
        expect(payload.prizes).toEqual([{ place: 1, reward: 'A hardware key' }, { place: 2, reward: 'Stickers' }])
    })

    it('never sends the challenge set: an existing set changes with its own calls', () => {
        const initial = fromCompetition(competition);
        expect(buildUpdatePayload(initial, { ...initial, challenges: [] })).not.toHaveProperty('challenges')
    })

    it('shows the status the clock gives and ends a competition only when asked', () => {
        expect(fromCompetition(makeCompetition({ status: 'live' })).status).toBe('published')
        expect(fromCompetition(makeCompetition({ status: 'frozen' })).status).toBe('published')
        expect(fromCompetition(makeCompetition({ status: 'draft' })).status).toBe('draft')
        expect(fromCompetition(makeCompetition({ status: 'ended' })).status).toBe('ended')
        expect(fromCompetition(makeCompetition({ status: 'cancelled' })).status).toBe('cancelled')
    })
})

describe('validation', () => {
    it('accepts a complete form', () => {
        expect(validateCompetition(filled())).toEqual({})
    })

    it('asks for the required fields', () => {
        const errors = validateCompetition(emptyCompetition('UTC'));
        expect(Object.keys(errors).sort()).toEqual(['description', 'endDate', 'startDate', 'title'])
    })

    it('holds the same limits as the API', () => {
        const errors = validateCompetition(filled({
            title: 'ab', slug: 'Bad Slug', shortDescription: 'x'.repeat(201), description: 'y'.repeat(5001), rules: 'z'.repeat(10001), image: 'javascript:alert(1)', maxParticipants: '-1',
        }));
        expect(errors.title).toMatch(/at least 3/)
        expect(errors.slug).toMatch(/lowercase/)
        expect(errors.shortDescription).toMatch(/200/)
        expect(errors.description).toMatch(/5000/)
        expect(errors.rules).toMatch(/10000/)
        expect(errors.image).toMatch(/http/)
        expect(errors.maxParticipants).toMatch(/at least 0/)
    })

    it('refuses an end that is not after the start', () => {
        expect(validateCompetition(filled({ endDate: '2026-12-05', endTime: '10:00' })).endDate).toMatch(/after/)
        expect(validateCompetition(filled({ endDate: '2026-12-04' })).endDate).toMatch(/after/)
    })

    it('refuses a time the clock skips', () => {
        const errors = validateCompetition(filled({ timezone: 'Europe/Berlin', startDate: '2026-03-29', startTime: '02:30', endDate: '2026-03-30' }));
        expect(errors.startDate).toMatch(/does not exist/)
    })

    it('keeps the freeze between the start and the end, and asks for both parts', () => {
        expect(validateCompetition(filled({ frozenDate: '2026-12-06', frozenTime: '10:00' }))).toEqual({})
        expect(validateCompetition(filled({ frozenDate: '2026-12-04', frozenTime: '10:00' })).frozenAt).toMatch(/between/)
        expect(validateCompetition(filled({ frozenDate: '2026-12-07', frozenTime: '10:00' })).frozenAt).toMatch(/between/)
        expect(validateCompetition(filled({ frozenDate: '2026-12-06' })).frozenAt).toMatch(/both/)
    })

    it('checks team sizes only while teams are on', () => {
        expect(validateCompetition(filled({ teamsEnabled: false, minTeamSize: 'x', maxTeamSize: '99' }))).toEqual({})
        const errors = validateCompetition(filled({ teamsEnabled: true, minTeamSize: '5', maxTeamSize: '3' }));
        expect(errors.minTeamSize).toMatch(/cannot be larger/)
        expect(validateCompetition(filled({ teamsEnabled: true, minTeamSize: '1', maxTeamSize: '1' })).maxTeamSize).toMatch(/at least 2/)
        expect(validateCompetition(filled({ teamsEnabled: true, minTeamSize: '1', maxTeamSize: '11' })).maxTeamSize).toMatch(/at most 10/)
    })

    it('checks every prize row and at most ten rows', () => {
        const errors = validateCompetition(filled({ prizes: [{ key: 'a', place: '0', reward: 'x' }, { key: 'b', place: '2', reward: '  ' }] }));
        expect(errors['prizes.0.place']).toBeTruthy()
        expect(errors['prizes.1.reward']).toBeTruthy()
        const many = Array.from({ length: 11 }, (_, i) => ({ key: `k${i}`, place: String(i + 1), reward: 'x' }));
        expect(validateCompetition(filled({ prizes: many })).prizes).toMatch(/At most 10/)
    })

    it('does not make the admin fix a stored image link they did not touch', () => {
        const initial = fromCompetition(makeCompetition({ image: 'ftp://old.example.com/a.png' }));
        expect(validateCompetition(initial, { initial }).image).toBeUndefined()
        expect(validateCompetition({ ...initial, image: 'ftp://other.example.com/a.png' }, { initial }).image).toMatch(/http/)
    })
})

describe('server errors', () => {
    it('maps field paths to the box that shows them', () => {
        expect(formFieldPath('prizes.1.reward')).toBe('prizes.1.reward')
        expect(formFieldPath('prizes.1')).toBe('prizes.1.reward')
        expect(formFieldPath('challenges.3')).toBe('challenges')
        expect(formFieldPath('startDate')).toBe('startDate')
    })

    it('reads details[].field into the form keys', () => {
        const err = apiError('VALIDATION_ERROR', [{ field: 'endDate', message: 'End date must be after start date' }, { field: 'prizes.0.reward', message: 'Too long' }, { field: 'challenges.2', message: 'bad id' }]);
        expect(formErrors(err)).toEqual({ endDate: 'End date must be after start date', 'prizes.0.reward': 'Too long', challenges: 'bad id' })
    })

    it('puts the errors with no box of their own in the banner', () => {
        expect(hasVisibleField('frozenAt')).toBe(true)
        expect(hasVisibleField('prizes.0.reward')).toBe(true)
        expect(hasVisibleField('createdBy')).toBe(false)
        expect(unattachedErrors({ createdBy: 'Not allowed', title: 'x', 'form.0': 'Plain' })).toEqual(['CreatedBy: Not allowed', 'Plain'])
    })

    it('puts locked fields back to what the competition has', () => {
        const initial = filled({ teamsEnabled: false, scoringMode: 'static', maxTeamSize: '4' });
        const current = { ...initial, teamsEnabled: true, scoringMode: 'dynamic' as const, maxTeamSize: '2', title: 'Kept' };
        const reverted = revertLocked(initial, current, ['teamsEnabled', 'scoringMode']);
        expect(reverted).toMatchObject({ teamsEnabled: false, scoringMode: 'static', maxTeamSize: '2', title: 'Kept' })
        expect(buildUpdatePayload(initial, reverted)).toEqual({ title: 'Kept' })
    })

    it('forgets the prize errors of a row that was typed in, or all of them when the list moved', () => {
        const errors = { 'prizes.0.reward': 'a', 'prizes.1.place': 'b', title: 'c' };
        expect(clearPrizeErrors(errors, [1])).toEqual({ 'prizes.0.reward': 'a', title: 'c' })
        expect(clearPrizeErrors(errors, null)).toEqual({ title: 'c' })
        expect(clearPrizeErrors({ title: 'c' }, [0])).toEqual({ title: 'c' })
    })
})

describe('small helpers', () => {
    it('makes a slug the way the API does', () => {
        expect(slugFromTitle('  Winter CTF 2026!  ')).toBe('winter-ctf-2026')
        expect(slugFromTitle('Café Ünïcode')).toBe('cafe-unicode')
        expect(slugFromTitle('!!!')).toBe('')
    })

    it('names the next free prize place', () => {
        expect(nextPlace([])).toBe('1')
        expect(nextPlace([{ key: 'a', place: '1', reward: '' }, { key: 'b', place: '3', reward: '' }])).toBe('4')
    })

    it('turns a date and a time into an instant, or null', () => {
        expect(instantOf('2026-12-05', '10:00', 'UTC')).toBe('2026-12-05T10:00:00.000Z')
        expect(instantOf('', '10:00', 'UTC')).toBeNull()
        expect(instantOf('2026-02-31', '10:00', 'UTC')).toBeNull()
    })

    it('warns when a published competition has dates in the past', () => {
        const base = filled({ status: 'published' });
        expect(scheduleNote(base, new Date('2027-01-01T00:00:00Z'))).toMatch(/over/)
        expect(scheduleNote(base, new Date('2026-12-06T00:00:00Z'))).toMatch(/start is in the past/)
        expect(scheduleNote(base, new Date('2026-11-01T00:00:00Z'))).toBeNull()
        expect(scheduleNote({ ...base, status: 'draft' }, new Date('2027-01-01T00:00:00Z'))).toBeNull()
    })
})
