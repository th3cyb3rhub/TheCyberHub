import { describe, expect, it } from 'vitest'
import { jobMoveTarget, jobReference } from '../canonical'

describe('jobMoveTarget', () => {
    it('moves an old reference to the canonical address, encoded', () => {
        expect(jobMoveTarget('old-slug', 'new-slug-abc123')).toBe('/jobs/new-slug-abc123')
    })

    it.each(['../admin', 'a b', 'x/y', 'https://evil.example', '', '?next=/x', 'a'.repeat(201), 42, null, undefined, { slug: 'x' }])('does not move to %j', (bad) => {
        expect(jobMoveTarget('old-slug', bad)).toBeNull()
    })

    it('never moves to the reference that was asked for', () => {
        expect(jobMoveTarget('same-1', 'same-1')).toBeNull()
    })
})

describe('jobReference', () => {
    it('is the canonical reference when it is well formed, else the one asked for', () => {
        expect(jobReference('old', 'new-1')).toBe('new-1')
        expect(jobReference('old', '../x')).toBe('old')
        expect(jobReference('old', undefined)).toBe('old')
    })
})
