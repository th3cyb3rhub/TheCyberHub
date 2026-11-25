import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ pathname: '/labs', search: '' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname, useSearchParams: () => new URLSearchParams(nav.search) }))

import { NavigationProgress } from '../NavigationProgress'
import { announceNavigationStart } from '@/lib/navigationProgress'

const bar = () => screen.getByTestId('navigation-progress')

beforeEach(() => {
    vi.useFakeTimers()
    nav.pathname = '/labs'
    nav.search = ''
})
afterEach(() => { cleanup(); vi.useRealTimers(); document.body.innerHTML = '' })

const Page = () => <div><a href="/jobs">Jobs</a><a href="https://other.example/">Other</a><a href="/labs">Here</a><NavigationProgress /></div>

function setup() {
    window.history.pushState({}, '', '/labs')
    return render(<Page />)
}

describe('NavigationProgress', () => {
    it('is a hidden bar that takes no space and shows nothing before a click', () => {
        setup()
        expect(bar()).toHaveAttribute('aria-hidden', 'true')
        expect(bar().className).toMatch(/fixed/)
        expect(bar()).toHaveAttribute('data-phase', 'idle')
    })

    it('starts on a click on an internal link and ends when the address changes', () => {
        const { rerender } = setup()
        fireEvent.click(screen.getByText('Jobs'))
        act(() => { vi.advanceTimersByTime(150) })
        expect(bar()).toHaveAttribute('data-phase', 'running')
        nav.pathname = '/jobs'
        rerender(<Page />)
        expect(bar()).toHaveAttribute('data-phase', 'finishing')
        act(() => { vi.advanceTimersByTime(400) })
        expect(bar()).toHaveAttribute('data-phase', 'idle')
    })

    it('also ends when only the filters in the address change', () => {
        const { rerender } = setup()
        fireEvent.click(screen.getByText('Jobs'))
        act(() => { vi.advanceTimersByTime(150) })
        nav.search = 'category=web'
        rerender(<Page />)
        expect(bar()).toHaveAttribute('data-phase', 'finishing')
    })

    it('does not start for another site, the page itself or a click with a modifier', () => {
        setup()
        fireEvent.click(screen.getByText('Other'))
        fireEvent.click(screen.getByText('Here'))
        fireEvent.click(screen.getByText('Jobs'), { ctrlKey: true })
        act(() => { vi.advanceTimersByTime(1000) })
        expect(bar()).toHaveAttribute('data-phase', 'idle')
    })

    it('does not leak when the navigation never finishes: it lets go on its own', () => {
        setup()
        fireEvent.click(screen.getByText('Jobs'))
        act(() => { vi.advanceTimersByTime(150) })
        expect(bar()).toHaveAttribute('data-phase', 'running')
        act(() => { vi.advanceTimersByTime(10_000) })
        expect(bar()).toHaveAttribute('data-phase', 'finishing')
        act(() => { vi.advanceTimersByTime(400) })
        expect(bar()).toHaveAttribute('data-phase', 'idle')
        expect(vi.getTimerCount()).toBe(0)
    })

    it('starts for a navigation announced by code (a router push)', () => {
        setup()
        act(() => { announceNavigationStart() })
        act(() => { vi.advanceTimersByTime(150) })
        expect(bar()).toHaveAttribute('data-phase', 'running')
    })

    it('cleans up on unmount: it removes the listeners it added, and its own timers', () => {
        const add = vi.spyOn(document, 'addEventListener')
        const remove = vi.spyOn(document, 'removeEventListener')
        const { unmount } = setup()
        const added = add.mock.calls.find((c) => c[0] === 'click')![1]
        fireEvent.click(screen.getByText('Jobs'))
        // the bar's wait is pending now
        const pending = vi.getTimerCount()
        expect(pending).toBeGreaterThan(0)
        unmount()
        expect(remove).toHaveBeenCalledWith('click', added)
        expect(vi.getTimerCount()).toBeLessThan(pending)
        add.mockRestore()
        remove.mockRestore()
    })
})
