import { describe, expect, it } from 'vitest';
import { internalHref, itemLink, pathHref, safeHref } from '../display';
import { isInternalHost, linkProblem } from '../url';
import { applyVote, mapCached } from '../resourcePatch';
import { makeResource } from './fixtures';

describe('link safety', () => {
    it('only lets http and https through', () => {
        expect(safeHref('https://owasp.org/Top10')).toBe('https://owasp.org/Top10');
        expect(safeHref('javascript:alert(1)')).toBeNull();
        expect(safeHref('data:text/html,<script>1</script>')).toBeNull();
        expect(safeHref('/relative')).toBeNull();
        expect(safeHref(null)).toBeNull();
    });
    it('accepts only in-app routes as internal', () => {
        expect(internalHref('/challenges/x')).toBe('/challenges/x');
        expect(internalHref('//evil.example/x')).toBeNull();
        expect(internalHref('https://evil.example')).toBeNull();
        expect(internalHref('/a\\b')).toBeNull();
    });
    it('resolves item links by kind', () => {
        expect(itemLink({ href: '/labs/x' })).toEqual({ href: '/labs/x', external: false });
        expect(itemLink({ href: 'https://a.org/x', external: true })).toEqual({ href: 'https://a.org/x', external: true });
        expect(itemLink({ href: 'javascript:alert(1)', external: true })).toBeNull();
        expect(itemLink({ href: 'https://a.org', external: false })).toBeNull();
    });
    it('builds roadmap and path routes', () => {
        expect(pathHref('roadmap', 'web')).toBe('/roadmaps/web');
        expect(pathHref('path', 'web')).toBe('/learning-paths/web');
    });
    it('treats private looking hosts as internal', () => {
        for (const host of ['localhost', 'a.local', '10.0.0.1', '0x7f000001', 'intranet', '[::1]']) expect(isInternalHost(host)).toBe(true);
        expect(isInternalHost('owasp.org')).toBe(false);
        expect(linkProblem('https://owasp.org')).toBeNull();
        expect(linkProblem('mailto:a@b.c')).toBe('invalid');
    });
});

describe('vote patch', () => {
    const r = makeResource({ upvotes: 4, downvotes: 1, score: 3, viewer: { vote: 0, bookmarked: false, reading: null } });
    it('adds an upvote and flips a vote', () => {
        const up = applyVote(r, 1);
        expect(up).toMatchObject({ upvotes: 5, downvotes: 1, score: 4 });
        expect(applyVote(up, -1)).toMatchObject({ upvotes: 4, downvotes: 2, score: 2 });
        expect(applyVote(up, 0)).toMatchObject({ upvotes: 4, downvotes: 1, score: 3 });
    });
    it('does not go below zero and ignores a repeat', () => {
        expect(applyVote(makeResource({ upvotes: 0, downvotes: 0, viewer: { vote: 1, bookmarked: false, reading: null } }), 0).upvotes).toBe(0);
        expect(applyVote(r, 0)).toBe(r);
    });
    it('patches every cached shape', () => {
        const bump = (x: ReturnType<typeof makeResource>) => ({ ...x, title: 'changed' });
        expect((mapCached(r, 'r1', bump) as { title: string }).title).toBe('changed');
        expect((mapCached({ data: [r] }, 'r1', bump) as { data: { title: string }[] }).data[0].title).toBe('changed');
        expect((mapCached({ pages: [{ data: [r] }], pageParams: [1] }, 'r1', bump) as { pages: { data: { title: string }[] }[] }).pages[0].data[0].title).toBe('changed');
        expect(mapCached({ data: [r] }, 'other', bump)).toEqual({ data: [r] });
        expect(mapCached(null, 'r1', bump)).toBeNull();
    });
});
