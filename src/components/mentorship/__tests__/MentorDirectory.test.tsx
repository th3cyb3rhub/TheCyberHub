import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMentor } from '@/lib/mentorship/__tests__/fixtures'

const replace = vi.fn()
const search = vi.hoisted(() => ({ current: '' }))
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace, push: vi.fn() }),
    usePathname: () => '/mentorship',
    useSearchParams: () => new URLSearchParams(search.current),
}))

const list = vi.hoisted(() => ({ current: {} as Record<string, unknown>, filters: null as unknown }))
vi.mock('@/hooks/queries/useMentorship', () => ({
    useMentorList: (filters: unknown) => { list.filters = filters; return list.current },
}))

import { MentorDirectory } from '../MentorDirectory'

const result = (data: unknown[], over: Record<string, unknown> = {}) => ({
    isLoading: false, isError: false, isSuccess: true, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
    data: { pages: [{ data, pagination: { page: 1, limit: 12, total: data.length, pages: 1 } }] }, ...over,
})

beforeEach(() => {
    vi.clearAllMocks()
    search.current = ''
    list.current = result([makeMentor(), makeMentor({ _id: 'm2', user: { _id: 'u2', username: 'linus', name: 'Linus' } })])
})

describe('MentorDirectory', () => {
    it('lists mentors with a count', () => {
        render(<MentorDirectory />)
        expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(2)
        expect(screen.getByText('2 mentors listed')).toBeInTheDocument()
    })

    it('shows a loading state', () => {
        list.current = result([], { isLoading: true, isSuccess: false, data: undefined })
        render(<MentorDirectory />)
        expect(screen.getByRole('status', { name: 'Loading mentors' })).toBeInTheDocument()
    })

    it('shows the error with a retry', () => {
        const refetch = vi.fn()
        list.current = result([], { isError: true, isSuccess: false, error: new Error('down'), data: undefined, refetch })
        render(<MentorDirectory />)
        expect(screen.getByText('Could not load mentors')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }))
        expect(refetch).toHaveBeenCalled()
    })

    it('invites the first mentor when nobody is listed', () => {
        list.current = result([])
        render(<MentorDirectory />)
        expect(screen.getByText('Mentors are joining')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Apply to be the first' })).toHaveAttribute('href', '/mentorship/become-mentor')
    })

    it('reads the filters from the URL and offers to clear them', () => {
        search.current = 'expertise=osint&minRating=4'
        list.current = result([])
        render(<MentorDirectory />)
        expect(list.filters).toMatchObject({ expertise: ['osint'], minRating: 4 })
        expect(screen.getByText('No mentors match')).toBeInTheDocument()
        fireEvent.click(screen.getAllByRole('button', { name: /Clear filters/ })[0])
        expect(replace).toHaveBeenCalledWith('/mentorship', { scroll: false })
    })

    it('writes a topic into the URL', () => {
        render(<MentorDirectory />)
        fireEvent.click(screen.getByLabelText('OSINT'))
        expect(replace).toHaveBeenCalledTimes(1)
        expect(String(replace.mock.calls[0][0])).toContain('expertise=osint')
    })

    it('can include mentors without a free spot', () => {
        render(<MentorDirectory />)
        fireEvent.click(screen.getByLabelText('Only mentors with a free spot'))
        expect(String(replace.mock.calls[0][0])).toContain('hasCapacity=false')
    })

    it('pages on request', () => {
        const fetchNextPage = vi.fn()
        list.current = result([makeMentor()], { hasNextPage: true, fetchNextPage })
        render(<MentorDirectory />)
        fireEvent.click(screen.getByRole('button', { name: 'Show more mentors' }))
        expect(fetchNextPage).toHaveBeenCalled()
    })
})
