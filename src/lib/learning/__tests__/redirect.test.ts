import { describe, expect, it } from 'vitest'
import { pathMoveTarget } from '../redirect'

describe('pathMoveTarget', () => {
    it('moves a path opened under the roadmap address to its own address, and the other way round', () => {
        expect(pathMoveTarget('roadmap', 'web-basics', { kind: 'path', slug: 'web-basics' })).toBe('/learning-paths/web-basics')
        expect(pathMoveTarget('path', 'web-basics', { kind: 'roadmap', slug: 'web-basics' })).toBe('/roadmaps/web-basics')
    })

    it('encodes the slug it was given', () => {
        expect(pathMoveTarget('roadmap', 'a', { kind: 'path', slug: 'a/../b?x=1#y' })).toBe('/learning-paths/a%2F..%2Fb%3Fx%3D1%23y')
    })

    it('renders in place when the path is already of this kind (no loop)', () => {
        expect(pathMoveTarget('roadmap', 'x', { kind: 'roadmap', slug: 'x' })).toBeNull()
        expect(pathMoveTarget('path', 'x', { kind: 'path', slug: 'x' })).toBeNull()
    })

    it.each([undefined, null, '', 'course', 'ROADMAP', 7, {}, []])('renders in place for the kind %j', (kind) => {
        expect(pathMoveTarget('roadmap', 'x', { kind, slug: 'x' })).toBeNull()
    })

    it.each([undefined, null, '', 5, 'a\nb', 'a'.repeat(201)])('renders in place for the slug %j', (slug) => {
        expect(pathMoveTarget('roadmap', 'x', { kind: 'path', slug })).toBeNull()
    })

    it('never answers the address that was asked for', () => {
        // the requested slug has odd characters: its own encoded address would be the target only if the kind matched
        expect(pathMoveTarget('roadmap', 'a b', { kind: 'path', slug: 'a b' })).toBe('/learning-paths/a%20b')
    })
})
