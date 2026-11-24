import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCtfNow, useCtfStatus } from '../clock'
import { noteServerTime, resetServerClock } from '../serverClock'
import { makeCompetition } from './fixtures'

const comp = makeCompetition({ status: 'upcoming', startDate: '2026-12-05T10:00:00.000Z', endDate: '2026-12-07T10:00:00.000Z', frozenAt: null })

beforeEach(() => { vi.useFakeTimers(); resetServerClock() })
afterEach(() => { vi.useRealTimers(); resetServerClock() })

describe('useCtfNow', () => {
    it('follows the server clock and moves when the offset is learnt', () => {
        vi.setSystemTime(new Date('2026-12-05T09:59:00.000Z'))
        const { result } = renderHook(() => useCtfNow(1000))
        expect(result.current?.toISOString()).toBe('2026-12-05T09:59:00.000Z')
        act(() => { noteServerTime('2026-12-05T10:02:00.000Z', Date.now()) })
        expect(result.current?.toISOString()).toBe('2026-12-05T10:02:00.000Z')
        act(() => { vi.advanceTimersByTime(1000) })
        expect(result.current?.toISOString()).toBe('2026-12-05T10:02:01.000Z')
    })
})

describe('useCtfStatus', () => {
    it('flips to live when the clock reaches the start, and not before', () => {
        vi.setSystemTime(new Date('2026-12-05T09:59:58.000Z'))
        const { result } = renderHook(() => useCtfStatus(comp))
        expect(result.current).toBe('upcoming')
        act(() => { vi.advanceTimersByTime(3000) })
        expect(result.current).toBe('live')
    })

    it('re-renders only when the status changes, not on every tick', () => {
        vi.setSystemTime(new Date('2026-12-05T09:00:00.000Z'))
        let renders = 0
        renderHook(() => { renders += 1; return useCtfStatus(comp) })
        const before = renders
        act(() => { vi.advanceTimersByTime(30_000) })
        expect(renders).toBe(before)
    })

    it('corrects itself when the browser clock is fast and the server says it has not started', () => {
        vi.setSystemTime(new Date('2026-12-05T10:01:00.000Z'))
        const { result } = renderHook(() => useCtfStatus(comp))
        expect(result.current).toBe('live')
        act(() => { noteServerTime('2026-12-05T09:58:00.000Z', Date.now()) })
        expect(result.current).toBe('upcoming')
    })
})
