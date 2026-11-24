import { describe, it, expect } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeLab } from './fixtures'
import {
    buildCreatePayload, buildUpdatePayload, clearListErrors, emptyLab, formErrors, formFieldPath, fromLab, hasVisibleField, newFile, newFlag, newHint,
    parseTags, publishNeedsFlag, unattachedErrors, validateLab, type LabFormValues,
} from '../form'

const valid = (over: Partial<LabFormValues> = {}): LabFormValues => ({ ...emptyLab(), title: 'A new lab', description: 'Find the flag.', ...over })
const adminLab = (over = {}) => makeLab({ admin: { status: 'published', flagCount: 2, pointsOverride: 0, startCount: 1 }, ...over })

describe('form values from a lab', () => {
    it('start an edit with no flags, the lab\'s own points and every hint text', () => {
        const form = fromLab(adminLab({ admin: { status: 'draft', flagCount: 3, pointsOverride: 75, startCount: 0 }, hints: [{ index: 1, penalty: 20, unlocked: false, text: 'second' }, { index: 0, penalty: 10, unlocked: true, text: 'first' }] }))
        expect(form.flags).toEqual([])
        expect(form.points).toBe('75')
        expect(form.status).toBe('draft')
        expect(form.hints.map((h) => h.text)).toEqual(['first', 'second'])
        expect(form.tags).toBe('sqli')
    })
})

describe('write-only flags in the payload', () => {
    it('leaves flags out of an edit that did not type any', () => {
        const initial = fromLab(adminLab())
        const current = { ...initial, title: 'Renamed lab' }
        const payload = buildUpdatePayload(initial, current)
        expect(payload).toEqual({ title: 'Renamed lab' })
        expect('flags' in payload).toBe(false)
    })

    it('sends no fields at all for an untouched edit', () => {
        const initial = fromLab(adminLab())
        expect(buildUpdatePayload(initial, { ...initial })).toEqual({})
    })

    it('sends only the flags the admin typed, replacing all', () => {
        const initial = fromLab(adminLab())
        const current = { ...initial, flags: [{ ...newFlag(), value: '  flag{new}  ', caseSensitive: true }, { ...newFlag(), value: 'flag{two}' }] }
        expect(buildUpdatePayload(initial, current)).toEqual({ flags: [{ value: 'flag{new}', caseSensitive: true }, { value: 'flag{two}', caseSensitive: false }] })
    })

    it('leaves flags out of a create when none were typed, and sends them when typed', () => {
        expect('flags' in buildCreatePayload(valid())).toBe(false)
        expect(buildCreatePayload(valid({ flags: [{ ...newFlag(), value: 'flag{x}' }] })).flags).toEqual([{ value: 'flag{x}', caseSensitive: false }])
    })

    it('never puts a hash or a stored flag in the form', () => {
        const form = fromLab(adminLab())
        expect(JSON.stringify(form)).not.toMatch(/flag\{/)
        expect(form.flags).toHaveLength(0)
    })
})

describe('payload shape', () => {
    it('leaves out a blank slug, link and time on create, and trims', () => {
        const p = buildCreatePayload(valid({ title: '  A new lab  ', slug: '', labUrl: '  ', estimatedMinutes: '', tags: ' SQLi, web , sqli ' }))
        expect(p).toMatchObject({ title: 'A new lab', points: 0, tags: ['sqli', 'web'], status: 'draft' })
        expect('slug' in p).toBe(false)
        expect('labUrl' in p).toBe(false)
        expect('estimatedMinutes' in p).toBe(false)
    })

    it('clears a link and a time on edit with null', () => {
        const initial = fromLab(adminLab({ estimatedMinutes: 30 }))
        const p = buildUpdatePayload(initial, { ...initial, labUrl: '', estimatedMinutes: '' })
        expect(p).toEqual({ labUrl: null, estimatedMinutes: null })
    })

    it('sends hints and files whole when one changes, with numbers as numbers', () => {
        const initial = fromLab(adminLab())
        const current = { ...initial, hints: [...initial.hints, { ...newHint(), text: ' try a quote ', penalty: '15' }], files: [{ ...newFile(), name: 'a.zip', url: ' https://files.example.org/a.zip ', sizeBytes: '10', sha256: 'A'.repeat(64) }] }
        const p = buildUpdatePayload(initial, current)
        expect(p.hints).toHaveLength(3)
        expect(p.hints?.[2]).toEqual({ text: 'try a quote', penalty: 15 })
        expect(p.files).toEqual([{ name: 'a.zip', url: 'https://files.example.org/a.zip', sizeBytes: 10, sha256: 'a'.repeat(64) }])
    })

    it('parses tags to the API form', () => {
        expect(parseTags('Web, web,  SQLi\nxss')).toEqual(['web', 'sqli', 'xss'])
    })
})

describe('validation mirrors the API', () => {
    it('accepts a minimal draft', () => {
        expect(validateLab(valid())).toEqual({})
    })

    it('limits the title, description, points and minutes', () => {
        const e = validateLab(valid({ title: 'ab', description: '', points: '1001', estimatedMinutes: '1441' }))
        expect(e.title).toMatch(/at least 3/)
        expect(e.description).toMatch(/required/)
        expect(e.points).toMatch(/exceed 1000/)
        expect(e.estimatedMinutes).toMatch(/At most 1440/)
        expect(validateLab(valid({ title: 'x'.repeat(201) })).title).toMatch(/exceed 200/)
        expect(validateLab(valid({ description: 'x'.repeat(5001) })).description).toMatch(/exceed 5000/)
        expect(validateLab(valid({ instructions: 'x'.repeat(10001) })).instructions).toMatch(/exceed 10000/)
        expect(validateLab(valid({ points: '2.5' })).points).toMatch(/whole number/)
        expect(validateLab(valid({ points: '-1' })).points).toMatch(/negative/)
    })

    it('checks the slug: shape, length, reserved words and id lookalikes', () => {
        expect(validateLab(valid({ slug: 'my-lab-1' })).slug).toBeUndefined()
        expect(validateLab(valid({ slug: 'My Lab' })).slug).toMatch(/lowercase/)
        expect(validateLab(valid({ slug: 'ab' })).slug).toMatch(/3 to 80/)
        expect(validateLab(valid({ slug: 'a--b' })).slug).toMatch(/single hyphens/)
        expect(validateLab(valid({ slug: 'leaderboard' })).slug).toMatch(/reserved/)
        expect(validateLab(valid({ slug: 'a'.repeat(24) })).slug).toMatch(/look like an id/)
    })

    it('checks tags: count, length and characters', () => {
        expect(validateLab(valid({ tags: Array.from({ length: 11 }, (_, i) => `tag${i}`).join(',') })).tags).toMatch(/At most 10/)
        expect(validateLab(valid({ tags: 'a' })).tags).toMatch(/2 to 30/)
        expect(validateLab(valid({ tags: 'x'.repeat(31) })).tags).toMatch(/2 to 30/)
        expect(validateLab(valid({ tags: 'ok, bad!' })).tags).toMatch(/letters, numbers/)
        expect(validateLab(valid({ tags: 'c++, asp.net, web app' })).tags).toBeUndefined()
    })

    it('checks hints: text, cost and the count', () => {
        const e = validateLab(valid({ hints: [{ ...newHint(), text: '' }, { ...newHint(), penalty: '1001' }, { ...newHint(), penalty: 'abc' }, { ...newHint(), text: 'x'.repeat(1001) }] }))
        expect(e['hints.0.text']).toMatch(/Write the hint/)
        expect(e['hints.1.penalty']).toMatch(/at most 1000/)
        expect(e['hints.2.penalty']).toMatch(/whole number/)
        expect(e['hints.3.text']).toMatch(/at most 1000/)
        const many = Array.from({ length: 11 }, () => ({ ...newHint(), text: 'x' }))
        expect(validateLab(valid({ hints: many })).hints).toMatch(/At most 10/)
        expect(validateLab(valid({ hints: [{ ...newHint(), text: 'ok', penalty: '0' }] }))).toEqual({})
    })
})

describe('file and link rules', () => {
    const file = (over = {}) => ({ ...newFile(), name: 'a.zip', url: 'https://files.example.org/a.zip', ...over })

    it('accepts a public https or http link', () => {
        expect(validateLab(valid({ files: [file(), file({ url: 'http://files.example.org/b' })], labUrl: 'https://lab.example.org/' }))).toEqual({})
    })

    it.each([
        ['javascript:alert(1)'], ['data:text/html,hi'], ['ftp://files.example.org/a'], ['file:///etc/passwd'],
        ['http://localhost/a'], ['http://127.0.0.1/a'], ['http://10.0.0.5/a'], ['http://192.168.1.2/a'], ['http://[::1]/a'],
        ['http://intranet/a'], ['http://app.internal/a'], ['http://app.local/a'], ['http://2130706433/a'], ['http://0x7f000001/a'],
        ['https://user:pass@files.example.org/a'], ['not a link'], [`https://files.example.org/${'a'.repeat(2100)}`],
    ])('refuses %s as a file link and as the target', (url) => {
        const e = validateLab(valid({ files: [file({ url })], labUrl: url }))
        expect(e['files.0.url']).toBeTruthy()
        expect(e.labUrl).toBeTruthy()
    })

    it('checks name, size and checksum', () => {
        const e = validateLab(valid({ files: [file({ name: '' }), file({ sizeBytes: '-1' }), file({ sizeBytes: '1.5' }), file({ sha256: 'xyz' }), file({ name: 'x'.repeat(121) })] }))
        expect(e['files.0.name']).toMatch(/Give the file a name/)
        expect(e['files.1.sizeBytes']).toMatch(/negative|whole/)
        expect(e['files.2.sizeBytes']).toMatch(/whole number/)
        expect(e['files.3.sha256']).toMatch(/64 hexadecimal/)
        expect(e['files.4.name']).toMatch(/at most 120/)
        expect(validateLab(valid({ files: Array.from({ length: 11 }, () => file()) })).files).toMatch(/At most 10/)
    })

    it('does not make an admin fix a stored link they did not touch', () => {
        const initial = fromLab(adminLab({ labUrl: 'http://old.local/x', files: [{ name: 'a', url: 'http://10.0.0.1/a', sizeBytes: null, sha256: null }] }))
        expect(validateLab({ ...initial, title: 'Another title' }, { initial, flagCount: 1 })).toEqual({})
        expect(validateLab({ ...initial, labUrl: 'http://other.local/x' }, { initial, flagCount: 1 }).labUrl).toBeTruthy()
    })
})

describe('flags and publishing', () => {
    it('refuses a blank flag row and an over-long flag', () => {
        const e = validateLab(valid({ flags: [{ ...newFlag(), value: '  ' }, { ...newFlag(), value: 'x'.repeat(201) }] }))
        expect(e['flags.0']).toMatch(/Enter the flag/)
        expect(e['flags.1']).toMatch(/at most 200/)
        expect(validateLab(valid({ flags: Array.from({ length: 11 }, () => ({ ...newFlag(), value: 'x' })) })).flags).toMatch(/At most 10/)
    })

    it('blocks publishing a new lab without a flag, and allows it once one is typed', () => {
        expect(validateLab(valid({ status: 'published' })).status).toMatch(/at least one flag/)
        expect(validateLab(valid({ status: 'published', flags: [{ ...newFlag(), value: 'flag{x}' }] }))).toEqual({})
        expect(publishNeedsFlag(valid({ status: 'published' }), 0)).toBe(true)
        expect(publishNeedsFlag(valid({ status: 'draft' }), 0)).toBe(false)
    })

    it('lets an edit publish a lab that already has flags, without typing any', () => {
        const initial = fromLab(adminLab({ admin: { status: 'draft', flagCount: 2, pointsOverride: 0, startCount: 0 } }))
        expect(validateLab({ ...initial, status: 'published' }, { initial, flagCount: 2 })).toEqual({})
        expect(validateLab({ ...initial, status: 'published' }, { initial, flagCount: 0 }).status).toBeTruthy()
    })
})

describe('server errors on the form', () => {
    it('maps paths to the field that shows them', () => {
        expect(formFieldPath('tags.3')).toBe('tags')
        expect(formFieldPath('flags.2.value')).toBe('flags.2')
        expect(formFieldPath('flags')).toBe('flags')
        expect(formFieldPath('hints.1.text')).toBe('hints.1.text')
        expect(formFieldPath('files.0.url')).toBe('files.0.url')
        const err = new ApiError('x', 400, 'VALIDATION_ERROR', [{ field: 'files.0.url', message: 'must point to a public website' }, { field: 'tags.1', message: 'bad tag' }, { field: 'estimatedMinutes', message: 'too big' }])
        expect(formErrors(err)).toEqual({ 'files.0.url': 'must point to a public website', tags: 'bad tag', estimatedMinutes: 'too big' })
    })

    it('reads a key with no field of its own in the banner', () => {
        expect(hasVisibleField('hints.0.text')).toBe(true)
        expect(hasVisibleField('flags.1')).toBe(true)
        expect(hasVisibleField('files.0.extra')).toBe(false)
        expect(hasVisibleField('createdBy')).toBe(false)
        expect(unattachedErrors({ title: 'x', createdBy: 'not allowed', 'form.0': 'Odd' })).toEqual(['CreatedBy: not allowed', 'Odd'])
    })

    it('forgets the errors of a list that changed shape', () => {
        const errors = { 'hints.0.text': 'a', 'hints.2.text': 'b', title: 'c' }
        expect(clearListErrors(errors, 'hints', [0])).toEqual({ 'hints.2.text': 'b', title: 'c' })
        expect(clearListErrors(errors, 'hints', null)).toEqual({ title: 'c' })
        expect(clearListErrors(errors, 'files', null)).toBe(errors)
    })
})
