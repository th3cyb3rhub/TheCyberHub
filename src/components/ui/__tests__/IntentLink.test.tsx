import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const router = vi.hoisted(() => ({ prefetch: vi.fn(), current: null as { prefetch: (href: string) => void } | null }))
vi.mock('next/navigation', () => ({
    useRouter: () => {
        if (!router.current) throw new Error('invariant expected app router to be mounted')
        return router.current
    },
}))
vi.mock('next/link', () => ({ default: ({ prefetch, ...p }: React.ComponentProps<'a'> & { prefetch?: boolean }) => <a data-prefetch={String(prefetch)} {...p} /> }))

import { IntentLink } from '../IntentLink'

beforeEach(() => { router.prefetch.mockClear(); router.current = { prefetch: router.prefetch } })

describe('IntentLink', () => {
    it('does not prefetch on its own', () => {
        render(<IntentLink href="/jobs/x">x</IntentLink>)
        expect(screen.getByText('x')).toHaveAttribute('data-prefetch', 'false')
        expect(router.prefetch).not.toHaveBeenCalled()
    })

    it('prefetches the page once when the pointer rests on it, it gets focus or a finger touches it', () => {
        render(<IntentLink href="/jobs/x">x</IntentLink>)
        fireEvent.mouseEnter(screen.getByText('x'))
        fireEvent.focus(screen.getByText('x'))
        fireEvent.touchStart(screen.getByText('x'))
        expect(router.prefetch).toHaveBeenCalledTimes(1)
        expect(router.prefetch).toHaveBeenCalledWith('/jobs/x')
    })

    it('keeps the caller\'s own handlers', () => {
        const enter = vi.fn()
        render(<IntentLink href="/jobs/x" onMouseEnter={enter}>x</IntentLink>)
        fireEvent.mouseEnter(screen.getByText('x'))
        expect(enter).toHaveBeenCalledTimes(1)
    })

    it('does not prefetch an address of another site', () => {
        render(<IntentLink href="https://other.example/">x</IntentLink>)
        fireEvent.mouseEnter(screen.getByText('x'))
        expect(router.prefetch).not.toHaveBeenCalled()
    })

    it('renders where there is no app router (a card on its own in a test)', () => {
        router.current = null
        render(<IntentLink href="/jobs/x">x</IntentLink>)
        fireEvent.mouseEnter(screen.getByText('x'))
        expect(screen.getByText('x')).toBeInTheDocument()
    })
})
