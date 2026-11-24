import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { useDocumentVisible } from '../useDocumentVisible'

const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => setVisibility('visible'))

describe('useDocumentVisible', () => {
    it('follows the tab being hidden and shown', () => {
        const { result } = renderHook(() => useDocumentVisible())
        expect(result.current).toBe(true)
        act(() => setVisibility('hidden'))
        expect(result.current).toBe(false)
        act(() => setVisibility('visible'))
        expect(result.current).toBe(true)
    })
})
