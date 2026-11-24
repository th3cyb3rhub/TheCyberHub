import { describe, it, expect } from 'vitest'
import { awardFor, categoryLabel, formatBytes, hintCost, minutesLabel, pointsAfterHint, pointsText, safeHref, shortDigest } from '../display'

describe('score maths', () => {
    it('pays the base minus the penalty of every opened hint', () => {
        expect(awardFor(100, [])).toBe(100)
        expect(awardFor(100, [10, 20])).toBe(70)
    })

    it('never goes below zero', () => {
        expect(awardFor(50, [30, 30])).toBe(0)
        expect(awardFor(0, [10])).toBe(0)
    })

    it('ignores a negative penalty rather than adding points', () => {
        expect(awardFor(50, [-10])).toBe(50)
    })

    it('charges a hint no more than what is left', () => {
        expect(hintCost(50, 20)).toBe(20)
        expect(hintCost(15, 20)).toBe(15)
        expect(hintCost(0, 20)).toBe(0)
        expect(pointsAfterHint(50, 20)).toBe(30)
        expect(pointsAfterHint(15, 20)).toBe(0)
    })

    it('words points', () => {
        expect(pointsText(1)).toBe('1 point')
        expect(pointsText(0)).toBe('0 points')
    })
})

describe('display helpers', () => {
    it('words time, size and category', () => {
        expect(minutesLabel(45)).toBe('45 min')
        expect(minutesLabel(90)).toBe('1 h 30 min')
        expect(minutesLabel(120)).toBe('2 h')
        expect(minutesLabel(null)).toBeNull()
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(1536)).toBe('1.5 KB')
        expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
        expect(formatBytes(null)).toBeNull()
        expect(categoryLabel('web-security')).toBe('Web security')
        expect(categoryLabel('osint')).toBe('OSINT')
        expect(categoryLabel('iot-security')).toBe('Iot security')
        expect(categoryLabel('iot')).toBe('IoT')
        expect(shortDigest('a'.repeat(64))).toBe(`${'a'.repeat(10)}...${'a'.repeat(8)}`)
    })

    it('drops every link that is not http or https', () => {
        expect(safeHref('https://x.example.org/a')).toBe('https://x.example.org/a')
        expect(safeHref('javascript:alert(1)')).toBeNull()
        expect(safeHref('data:text/html,<script>1</script>')).toBeNull()
        expect(safeHref('ftp://x.example.org')).toBeNull()
        expect(safeHref('')).toBeNull()
        expect(safeHref(null)).toBeNull()
    })
})
