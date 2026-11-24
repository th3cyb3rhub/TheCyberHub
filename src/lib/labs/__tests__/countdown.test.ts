import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { formatClock, secondsUntil, useCountdown } from '../countdown'

afterEach(() => vi.useRealTimers())

describe('countdown', () => {
    it('formats minutes and seconds', () => {
        expect(formatClock(905)).toBe('15:05')
        expect(formatClock(59)).toBe('0:59')
        expect(formatClock(-3)).toBe('0:00')
        expect(secondsUntil(null)).toBe(0)
        expect(secondsUntil(10_500, 10_000)).toBe(1)
    })

    it('counts down each second and calls onDone once at the end', () => {
        vi.useFakeTimers()
        const done = vi.fn()
        const until = Date.now() + 3000
        const { result } = renderHook(() => useCountdown(until, done))
        expect(result.current).toBe(3)
        act(() => { vi.advanceTimersByTime(1000) })
        expect(result.current).toBe(2)
        act(() => { vi.advanceTimersByTime(2000) })
        expect(result.current).toBe(0)
        expect(done).toHaveBeenCalledTimes(1)
        act(() => { vi.advanceTimersByTime(5000) })
        expect(done).toHaveBeenCalledTimes(1)
    })

    it('stays at zero with no lock', () => {
        const { result } = renderHook(() => useCountdown(null))
        expect(result.current).toBe(0)
    })
})
