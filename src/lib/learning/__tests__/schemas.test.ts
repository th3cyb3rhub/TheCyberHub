import { describe, expect, it } from 'vitest';
import { LIMITS, parseTags, pathEditorSchema, rejectSchema, reportSchema, requestChangesSchema, resourceSubmitSchema, zodFieldErrors } from '../schemas';
import { emptyPathValues } from '../editor';

const resource = { title: 'OWASP Top 10', url: 'https://owasp.org/Top10', type: 'article', topic: 'web-security', difficulty: 'beginner', isFree: true, tags: [], description: 'The ten most critical web application risks, explained.' };

describe('resourceSubmitSchema', () => {
    it('accepts a good submission', () => {
        expect(resourceSubmitSchema.safeParse(resource).success).toBe(true);
    });
    it.each([
        ['javascript:alert(1)', 'url'],
        ['ftp://example.org/file', 'url'],
        ['https://user:pw@example.org/', 'url'],
        ['http://localhost:3000/x', 'url'],
        ['http://192.168.0.1/x', 'url'],
        ['intranet', 'url'],
    ])('rejects the link %s', (url, field) => {
        const r = resourceSubmitSchema.safeParse({ ...resource, url });
        expect(r.success).toBe(false);
        if (!r.success) expect(Object.keys(zodFieldErrors(r.error))).toContain(field);
    });
    it('enforces the title and description limits', () => {
        const short = resourceSubmitSchema.safeParse({ ...resource, title: 'abc', description: 'too short' });
        expect(short.success).toBe(false);
        if (!short.success) expect(zodFieldErrors(short.error)).toMatchObject({ title: expect.stringContaining('at least 5'), description: expect.stringContaining('at least 20') });
        expect(resourceSubmitSchema.safeParse({ ...resource, title: 'x'.repeat(LIMITS.title.max + 1) }).success).toBe(false);
        expect(resourceSubmitSchema.safeParse({ ...resource, description: 'x'.repeat(LIMITS.description.max + 1) }).success).toBe(false);
    });
    it('counts a title without its markup', () => {
        expect(resourceSubmitSchema.safeParse({ ...resource, title: '<b>ab</b>' }).success).toBe(false);
    });
    it('limits and normalises tags', () => {
        expect(resourceSubmitSchema.safeParse({ ...resource, tags: Array.from({ length: 9 }, (_, i) => `tag${i}`) }).success).toBe(false);
        expect(resourceSubmitSchema.safeParse({ ...resource, tags: ['a'] }).success).toBe(false);
        expect(resourceSubmitSchema.safeParse({ ...resource, tags: ['xss', 'xss'] }).success).toBe(false);
        expect(resourceSubmitSchema.safeParse({ ...resource, tags: ['<script>'] }).success).toBe(false);
        expect(resourceSubmitSchema.safeParse({ ...resource, tags: ['c++', 'web-3'] }).success).toBe(true);
    });
    it('needs a type, a topic and a difficulty', () => {
        expect(resourceSubmitSchema.safeParse({ ...resource, type: '' }).success).toBe(false);
        expect(resourceSubmitSchema.safeParse({ ...resource, topic: 'nope' }).success).toBe(false);
    });
});

describe('parseTags', () => {
    it('trims, lowercases and removes repeats and empties', () => {
        expect(parseTags(' XSS, sqli ,, xss ,')).toEqual(['xss', 'sqli']);
        expect(parseTags('')).toEqual([]);
    });
});

describe('moderation schemas', () => {
    it('requires a note for the reason "other"', () => {
        const r = rejectSchema.safeParse({ reason: 'other', note: '  ' });
        expect(r.success).toBe(false);
        if (!r.success) expect(zodFieldErrors(r.error)).toHaveProperty('note');
        expect(rejectSchema.safeParse({ reason: 'duplicate', note: '' }).success).toBe(true);
        expect(rejectSchema.safeParse({ reason: 'duplicate', note: 'x'.repeat(LIMITS.rejectNote + 1) }).success).toBe(false);
        expect(rejectSchema.safeParse({ reason: 'nope', note: '' }).success).toBe(false);
    });
    it('checks the report and the change request', () => {
        expect(reportSchema.safeParse({ reason: 'spam', details: '' }).success).toBe(true);
        expect(reportSchema.safeParse({ reason: 'spam', details: 'x'.repeat(501) }).success).toBe(false);
        expect(requestChangesSchema.safeParse({ note: 'ok' }).success).toBe(false);
        expect(requestChangesSchema.safeParse({ note: 'Please add sources.' }).success).toBe(true);
    });
});

describe('pathEditorSchema', () => {
    const valid = () => ({
        ...emptyPathValues(), title: 'Web hacking', description: 'A long enough description.',
        modules: [
            { key: 'basics', title: 'HTTP basics', description: '', stage: '', duration: '', optional: false, requires: [], items: [] },
            { key: 'attacks', title: 'Attacks', description: '', stage: '', duration: '', optional: false, requires: ['basics'], items: [{ kind: 'external' as const, ref: 'https://owasp.org', title: '', optional: false }] },
        ],
    });
    it('accepts a valid roadmap', () => {
        expect(pathEditorSchema.safeParse(valid()).success).toBe(true);
    });
    it('flags duplicate keys and unknown requirements on the right step', () => {
        const dup = valid();
        dup.modules[1].key = 'basics';
        dup.modules[1].requires = [];
        const r1 = pathEditorSchema.safeParse(dup);
        expect(r1.success).toBe(false);
        if (!r1.success) expect(zodFieldErrors(r1.error)).toHaveProperty(['modules.1.key']);

        const bad = valid();
        bad.modules[1].requires = ['missing'];
        const r2 = pathEditorSchema.safeParse(bad);
        expect(r2.success).toBe(false);
        if (!r2.success) expect(zodFieldErrors(r2.error)).toHaveProperty(['modules.1.requires']);
    });
    it('checks item references by kind', () => {
        const bad = valid();
        bad.modules[1].items = [{ kind: 'resource', ref: 'not-an-id', title: '', optional: false }, { kind: 'external', ref: 'javascript:alert(1)', title: '', optional: false }];
        const r = pathEditorSchema.safeParse(bad);
        expect(r.success).toBe(false);
        if (!r.success) expect(Object.keys(zodFieldErrors(r.error))).toEqual(expect.arrayContaining(['modules.1.items.0.ref', 'modules.1.items.1.ref']));
    });
    it('needs a title, description and a key in the allowed shape', () => {
        const bad = { ...valid(), title: 'ab', description: 'short' };
        bad.modules[0].key = 'Bad Key';
        const r = pathEditorSchema.safeParse(bad);
        expect(r.success).toBe(false);
        if (!r.success) expect(Object.keys(zodFieldErrors(r.error))).toEqual(expect.arrayContaining(['title', 'description', 'modules.0.key']));
    });
});
