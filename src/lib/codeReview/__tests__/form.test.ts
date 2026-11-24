import { describe, expect, it } from 'vitest'
import {
    buildPayload, byteLength, countLines, emptySnippet, findingBands, findingProblems, fromSnippet, newFinding, newHint, normaliseCode, overlapBands, parseTags,
    slugProblem, validateSnippet, wouldBeStripped, type CrFormValues,
} from '../form'
import { CODE, makeAdminSnippet } from './fixtures'

const valid = (over: Partial<CrFormValues> = {}): CrFormValues => ({
    ...emptySnippet(),
    title: 'Login check', description: 'Review this login function.', vulnerableCode: CODE,
    findings: [{ ...newFinding({ start: 4, end: 5 }), explanation: 'The name is put in the query.' }],
    ...over,
})

describe('counting lines like the API', () => {
    it('normalises line endings and trailing blank space, keeps indentation', () => {
        expect(normaliseCode('a\r\n  b  \r\n\r\n')).toBe('a\n  b')
        expect(countLines('a\r\nb\r\n\r\n')).toBe(2)
        expect(countLines('')).toBe(0)
        expect(countLines('   \n  ')).toBe(0)
        expect(byteLength('é')).toBe(2)
    })
})

describe('finding ranges against the code', () => {
    const rows = (...pairs: [string, string][]) => pairs.map(([lineStart, lineEnd]) => ({ lineStart, lineEnd }))

    it('accepts ranges inside the code that share no line', () => {
        expect(findingProblems(rows(['1', '2'], ['3', '3'], ['7', '7']), 7)).toEqual([])
    })

    it('says a range is past the end of the code', () => {
        const p = findingProblems(rows(['6', '9']), 7)
        expect(p).toHaveLength(1)
        expect(p[0]).toMatchObject({ index: 0, field: 'lineEnd' })
        expect(p[0].message).toContain('past the end of the code (7 lines)')
        expect(findingProblems(rows(['8', '8']), 7)[0]).toMatchObject({ field: 'lineStart' })
    })

    it('says the end is before the start, and a missing or non numeric line', () => {
        expect(findingProblems(rows(['5', '3']), 7)[0].message).toMatch(/before the first line/)
        expect(findingProblems(rows(['', '3']), 7)[0]).toMatchObject({ field: 'lineStart' })
        expect(findingProblems(rows(['2', 'x']), 7)[0]).toMatchObject({ field: 'lineEnd' })
        expect(findingProblems(rows(['0', '3']), 7)[0]).toMatchObject({ field: 'lineStart' })
    })

    it('says which finding another one overlaps, even when they were typed out of order', () => {
        const p = findingProblems(rows(['5', '6'], ['1', '5']), 7)
        expect(p).toHaveLength(1)
        expect(p[0]).toMatchObject({ index: 0, field: 'lineStart' })
        expect(p[0].message).toBe('Overlaps finding 2: findings cannot share lines')
        // one line apart is fine
        expect(findingProblems(rows(['1', '4'], ['5', '6']), 7)).toEqual([])
        // a long finding that holds a short one
        expect(findingProblems(rows(['1', '7'], ['3', '3']), 7)).toHaveLength(1)
    })

    it('paints only the ranges that parse and clips to the code', () => {
        expect(findingBands(rows(['2', '3'], ['x', '4'], ['6', '99']), 7)).toEqual([{ start: 2, end: 3, index: 0 }, { start: 6, end: 7, index: 2 }])
        expect(overlapBands([{ start: 1, end: 5 }, { start: 4, end: 8 }, { start: 20, end: 21 }])).toEqual([{ start: 4, end: 5 }])
    })
})

describe('validation', () => {
    it('a complete exercise has no problem', () => {
        expect(validateSnippet(valid(), { mode: 'create' })).toEqual({})
    })

    it('mirrors the limits of the API', () => {
        const e = validateSnippet(valid({
            title: 'ab', description: 'short', vulnerableCode: 'x', points: '1001', tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(','),
        }), { mode: 'create' })
        expect(e.title).toMatch(/3 to 200/)
        expect(e.description).toMatch(/10 to 2000/)
        expect(e.vulnerableCode).toMatch(/at least 10/)
        expect(e.points).toMatch(/0 to 1000/)
        expect(e.tags).toMatch(/At most 10/)
    })

    it('refuses code over 30 KB', () => {
        expect(validateSnippet(valid({ vulnerableCode: 'a'.repeat(30 * 1024 + 1) }), { mode: 'create' }).vulnerableCode).toMatch(/30 KB/)
        expect(validateSnippet(valid({ vulnerableCode: 'a'.repeat(30 * 1024) }), { mode: 'create' }).vulnerableCode).toBeUndefined()
    })

    it('finds a finding that does not fit the code or shares a line, with the field path of the API', () => {
        const findings = [
            { ...newFinding({ start: 2, end: 9 }), explanation: 'Long enough text.' },
            { ...newFinding({ start: 4, end: 5 }), explanation: 'Long enough text.' },
        ]
        const e = validateSnippet(valid({ findings }), { mode: 'create' })
        expect(e['findings.0.lineEnd']).toMatch(/past the end/)
        expect(Object.keys(e).filter((k) => k.startsWith('findings.1'))).toEqual([])
        const overlap = validateSnippet(valid({ findings: [{ ...findings[1], lineStart: '1', lineEnd: '5' }, { ...findings[1], lineStart: '4', lineEnd: '6' }] }), { mode: 'create' })
        expect(overlap['findings.1.lineStart']).toMatch(/Overlaps finding 1/)
    })

    it('a later edit of the code that cuts a finding off is caught', () => {
        const e = validateSnippet(valid({ vulnerableCode: 'line one is here\nline two is here' }), { mode: 'create' })
        expect(e['findings.0.lineStart']).toMatch(/past the end of the code \(2 lines\)/)
    })

    it('checks each finding text, a CWE, and the hints', () => {
        const f = { ...newFinding({ start: 1, end: 1 }), explanation: 'short', cwe: 'CWE89', title: 'x'.repeat(121) }
        const e = validateSnippet(valid({ findings: [f], hints: [{ ...newHint(), text: '' }, { ...newHint(), text: 'ok', cost: '101' }, { ...newHint(), text: 'ok', cost: '' }] }), { mode: 'create' })
        expect(e['findings.0.explanation']).toMatch(/at least 10/)
        expect(e['findings.0.cwe']).toBe('A CWE looks like CWE-89')
        expect(e['findings.0.title']).toMatch(/at most 120/)
        expect(e['hints.0.text']).toBe('Write the hint')
        expect(e['hints.1.cost']).toMatch(/0 to 100/)
        expect(e['hints.2.cost']).toMatch(/0 to 100/)
    })

    it('limits the number of findings and hints', () => {
        const many = Array.from({ length: 41 }, (_, i) => ({ ...newFinding({ start: 1, end: 1 }), explanation: `explain number ${i}` }))
        expect(validateSnippet(valid({ findings: many }), { mode: 'create' }).findings).toMatch(/At most 40/)
        expect(validateSnippet(valid({ hints: Array.from({ length: 11 }, () => ({ ...newHint(), text: 'x' })) }), { mode: 'create' }).hints).toMatch(/At most 10/)
    })

    it('publishing needs a finding', () => {
        expect(validateSnippet(valid({ findings: [], isPublished: true }), { mode: 'create' }).findings).toMatch(/Add at least one finding/)
        expect(validateSnippet(valid({ findings: [], isPublished: false }), { mode: 'create' })).toEqual({})
    })

    it('the slug is only checked on create, with the API rules', () => {
        expect(slugProblem('')).toBeNull()
        expect(slugProblem('sql-login')).toBeNull()
        expect(slugProblem('ab')).toMatch(/3 to 80/)
        expect(slugProblem('Bad Slug')).toMatch(/lowercase/)
        expect(slugProblem('double--hyphen')).toMatch(/single hyphens/)
        expect(slugProblem('manage')).toBe('This slug is reserved')
        expect(slugProblem('a'.repeat(24))).toBe('A slug cannot look like an id (24 hexadecimal characters)')
        expect(validateSnippet(valid({ slug: 'manage' }), { mode: 'create' }).slug).toBeTruthy()
        expect(validateSnippet(valid({ slug: 'manage' }), { mode: 'edit' }).slug).toBeUndefined()
    })

    it('warns about what the API sanitiser would strip', () => {
        expect(wouldBeStripped('<script>alert(1)</script>')).toBe(true)
        expect(wouldBeStripped('<img src=x onerror="a()">')).toBe(true)
        expect(wouldBeStripped('x = a if b else c')).toBe(false)
        expect(wouldBeStripped('')).toBe(false)
    })
})

describe('payload', () => {
    it('sends numbers as numbers, trims text and sends no counters or derived fields', () => {
        const payload = buildPayload(valid({ title: '  Login  ', slug: ' My-Slug ', points: '40', tags: 'sqli, python, SQLI', hints: [{ ...newHint(), text: ' Look ', cost: '3' }] }), 'create')
        expect(payload).toMatchObject({ title: 'Login', slug: 'my-slug', points: 40, tags: ['sqli', 'python'], hints: [{ text: 'Look', cost: 3 }], isPublished: false })
        expect(payload.findings?.[0]).toMatchObject({ lineStart: 4, lineEnd: 5, vulnerabilityType: 'other', severity: 'medium' })
        for (const key of ['solveCount', 'attemptCount', 'findingCount', 'author', 'difficultyRank', 'lineCount', '_id']) expect(payload).not.toHaveProperty(key)
    })

    it('leaves out an empty slug, optional finding notes and an empty example on create; an edit never sends the slug and clears the example', () => {
        const create = buildPayload(valid(), 'create')
        expect(create).not.toHaveProperty('slug')
        expect(create).not.toHaveProperty('exploitExample')
        expect(create.findings?.[0]).not.toHaveProperty('exploit')
        expect(create.findings?.[0]).not.toHaveProperty('cwe')
        const edit = buildPayload(valid({ slug: 'kept' }), 'edit')
        expect(edit).not.toHaveProperty('slug')
        expect(edit.exploitExample).toEqual({})
    })

    it('puts the optional finding notes in when they are written', () => {
        const f = { ...newFinding({ start: 4, end: 5 }), explanation: 'Long enough text.', cwe: 'cwe-89', exploitPayload: "' OR 1=1", fixCode: 'safe()' }
        const p = buildPayload(valid({ findings: [f] }), 'create')
        expect(p.findings?.[0]).toMatchObject({ cwe: 'CWE-89', exploit: { payload: "' OR 1=1" }, fix: { code: 'safe()' } })
    })

    it('reads a snippet into the form and back without losing anything', () => {
        const snippet = makeAdminSnippet({
            tags: ['a', 'b'], points: 40, hints: [{ order: 2, text: 'two', cost: 5 }, { order: 1, text: 'one', cost: 3 }],
            exploitExample: { title: 'T', payload: 'p' }, fixedCode: 'fixed()',
        })
        const form = fromSnippet(snippet)
        expect(form.hints.map((h) => h.text)).toEqual(['one', 'two'])
        expect(form.tags).toBe('a, b')
        const back = buildPayload(form, 'edit')
        expect(back).toMatchObject({ title: snippet.title, points: 40, tags: ['a', 'b'], fixedCode: 'fixed()', exploitExample: { title: 'T', payload: 'p' }, isPublished: true })
        expect(back.findings?.[0]).toMatchObject({ lineStart: 4, lineEnd: 5, cwe: 'CWE-89', severity: 'critical' })
        expect(parseTags('a,,b\n a ')).toEqual(['a', 'b'])
    })
})
