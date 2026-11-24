import { describe, it, expect } from 'vitest'
import { codeProblem, dayLabel, fenceCode, looksLikeMarkup, groupByDay, languageLabel, mergeMessages, optimisticMessage, unfenceCode } from '../chat'
import { makeMessage } from './fixtures'

describe('mergeMessages', () => {
    it('keeps each id once, oldest first, newest data winning', () => {
        const a = makeMessage({ _id: '64b0000000000000000000d3', content: 'third' })
        const b = makeMessage({ _id: '64b0000000000000000000d1', content: 'first' })
        const b2 = makeMessage({ _id: '64b0000000000000000000d1', content: 'first', isRead: false })
        const merged = mergeMessages([a, b], [b2])
        expect(merged.map((m) => m.content)).toEqual(['first', 'third'])
        expect(merged[0].isRead).toBe(false)
    })
    it('sorts a message still being sent after the saved ones', () => {
        const sent = makeMessage({ _id: '64b0000000000000000000d9' })
        const temp = optimisticMessage({ id: 'pending-1', sender: sent.sender, channel: 'c', content: 'hi', contentType: 'text' })
        expect(mergeMessages([temp], [sent]).map((m) => m._id)).toEqual([sent._id, 'pending-1'])
        expect(temp.pending).toBe('sending')
    })
})

describe('day groups', () => {
    const now = new Date('2026-12-02T12:00:00Z')
    it('groups by the day in the viewer zone', () => {
        const msgs = [
            makeMessage({ _id: '1', createdAt: '2026-12-01T23:30:00Z' }),
            makeMessage({ _id: '2', createdAt: '2026-12-02T00:10:00Z' }),
            makeMessage({ _id: '3', createdAt: '2026-12-02T09:00:00Z' }),
        ]
        expect(groupByDay(msgs, 'UTC', now).map((g) => [g.label, g.messages.length])).toEqual([['Yesterday', 1], ['Today', 2]])
        // In Tokyo the first two fall on 2 December and the third too: one group
        expect(groupByDay(msgs, 'Asia/Tokyo', now).map((g) => g.messages.length)).toEqual([3])
    })
    it('names older days', () => expect(dayLabel('2026-11-20', now, 'UTC')).toBe('Fri, Nov 20'))
    it('copes with an unknown zone', () => expect(groupByDay([makeMessage()], 'Nope', now)).toHaveLength(1))
})

describe('code messages', () => {
    it('wraps code in a fence with the language after it', () => {
        expect(fenceCode('print(1)', 'python')).toBe('```python\nprint(1)\n```')
        expect(fenceCode('ls -la\n\n', null)).toBe('```\nls -la\n```')
    })
    it('uses a longer fence when the code holds backticks', () => {
        const fenced = fenceCode('echo ```x```', 'bash')
        expect(fenced.startsWith('````bash\n')).toBe(true)
        expect(unfenceCode(fenced)).toEqual({ code: 'echo ```x```', language: 'bash' })
    })
    it('drops a language label that is not a safe word', () => {
        expect(fenceCode('x', 'a b<script>')).toBe('```\nx\n```')
        expect(languageLabel('c++')).toBe('c++')
        expect(languageLabel('<b>')).toBeNull()
        expect(languageLabel('')).toBeNull()
    })
    it('takes the fence off again and keeps raw HTML as text', () => {
        expect(unfenceCode('```html\n<script>alert(1)</script>\n```')).toEqual({ code: '<script>alert(1)</script>', language: 'html' })
    })
    it('shows an unfenced code message as it is, with the language the API stored', () => {
        expect(unfenceCode('plain code', 'python')).toEqual({ code: 'plain code', language: 'python' })
    })
})

describe('code the composer refuses', () => {
    it('refuses three backticks in a row and explains what to do', () => {
        expect(codeProblem('echo "```"')).toMatch(/three backticks/)
        expect(codeProblem('a ```` b')).not.toBeNull()
    })
    it('allows single and double backticks', () => {
        expect(codeProblem('echo `date` and ``x``')).toBeNull()
        expect(codeProblem('print(1)')).toBeNull()
    })
})

describe('text that looks like markup', () => {
    it('spots tags', () => {
        expect(looksLikeMarkup('<script>alert(1)</script>')).toBe(true)
        expect(looksLikeMarkup('use <img src=x onerror=y> here')).toBe(true)
        expect(looksLikeMarkup('</div>')).toBe(true)
    })
    it('leaves ordinary text and comparisons alone', () => {
        expect(looksLikeMarkup('Hello there')).toBe(false)
        expect(looksLikeMarkup('if a < b and c > d')).toBe(false)
        expect(looksLikeMarkup('I <3 this')).toBe(false)
    })
})
