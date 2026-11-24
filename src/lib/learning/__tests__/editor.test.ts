import { describe, expect, it } from 'vitest';
import { emptyPathValues, keyFromTitle, moveNode, newNode, pathInput, removeNode, renameKey, valuesFromPath } from '../editor';
import type { EditorPath } from '@/types/learning';

const node = (key: string, requires: string[] = []) => ({ ...newNode([]), key, title: key, requires });

describe('editor helpers', () => {
    it('builds unique keys', () => {
        expect(keyFromTitle('Intro to XSS!', [])).toBe('intro-to-xss');
        expect(keyFromTitle('Intro to XSS!', ['intro-to-xss'])).toBe('intro-to-xss-2');
        expect(keyFromTitle('???', [])).toBe('step');
    });
    it('moves a step and ignores moves past the ends', () => {
        const list = ['a', 'b', 'c'];
        expect(moveNode(list, 1, -1)).toEqual(['b', 'a', 'c']);
        expect(moveNode(list, 0, -1)).toBe(list);
        expect(moveNode(list, 2, 1)).toBe(list);
    });
    it('removes a step from the requirements of the others', () => {
        const out = removeNode([node('a'), node('b', ['a']), node('c', ['a', 'b'])], 0);
        expect(out.map((n) => [n.key, n.requires])).toEqual([['b', []], ['c', ['b']]]);
    });
    it('renames a key where it is required', () => {
        const out = renameKey([node('a'), node('b', ['a'])], 0, 'start');
        expect(out.map((n) => [n.key, n.requires])).toEqual([['start', []], ['b', ['start']]]);
    });
});

describe('pathInput', () => {
    const values = { ...emptyPathValues(), title: 'Web', description: 'Long enough text', isFeatured: true, modules: [{ ...node('a'), id: 'n1' }, node('b')] };
    it('keeps ids of existing steps and sends the loaded timestamp', () => {
        const input = pathInput(values, { updatedAt: '2026-11-01T10:00:00Z', isAdmin: false });
        expect(input.ifUnmodifiedSince).toBe('2026-11-01T10:00:00Z');
        expect(input.modules?.[0]).toMatchObject({ _id: 'n1', key: 'a' });
        expect(input.modules?.[1]).not.toHaveProperty('_id');
    });
    it('sends isFeatured only for admins', () => {
        expect(pathInput(values, { isAdmin: false })).not.toHaveProperty('isFeatured');
        expect(pathInput(values, { isAdmin: true }).isFeatured).toBe(true);
    });
    it('omits the timestamp for a new path', () => {
        expect(pathInput(values)).not.toHaveProperty('ifUnmodifiedSince');
    });
    it('loads an editor path into form values', () => {
        const path = {
            id: 'p', slug: 's', title: 'T', kind: 'path', category: 'web-security', difficulty: 'beginner', estimatedDuration: '2 weeks', shortDescription: 's', description: 'd', skills: ['x'],
            prerequisites: [{ id: 'q', title: 'Q' }], seo: { metaDescription: 'm' }, isFeatured: true, stages: [], reviewedAt: null, updatedAt: '2026-11-01T10:00:00Z', status: 'draft',
            modules: [{ id: 'n1', key: 'a', title: 'A', description: '', stage: 'S', duration: '', optional: false, requires: [], items: [{ kind: 'external', ref: 'https://x.org', title: 'X', optional: false }] }],
        } as unknown as EditorPath;
        const v = valuesFromPath(path);
        expect(v).toMatchObject({ title: 'T', prerequisites: ['q'], metaDescription: 'm' });
        expect(v.modules[0]).toMatchObject({ id: 'n1', key: 'a', stage: 'S' });
    });
});
