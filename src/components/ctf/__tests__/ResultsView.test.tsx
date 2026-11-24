import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeCompetition, makeResults, teamBoard } from '@/lib/ctf/__tests__/fixtures'
import type { CtfResults } from '@/types/ctf'

const results = vi.hoisted(() => ({ data: undefined as CtfResults | undefined, isLoading: false, isPending: false, isError: false, error: null as unknown, refetch: vi.fn() }))
const detail = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock('@/hooks/queries/useCtf', () => ({ useCtfResults: () => results, useCtfCompetition: () => detail }))

import { ResultsView } from '../ResultsView'

const renderView = () => render(<ResultsView slug="winter-ctf" initialResults={null} />)

beforeEach(() => {
    vi.clearAllMocks()
    results.data = undefined; results.isLoading = false; results.isPending = false; results.isError = false; results.error = null
    detail.data = undefined
})

describe('ResultsView', () => {
    it('shows the podium, the standings, the challenges and the totals of an ended competition', () => {
        results.data = makeResults()
        renderView()
        const podium = screen.getByTestId('results')
        expect(within(podium).getAllByTestId('podium-place')).toHaveLength(2)
        expect(within(podium).getByTestId('podium-prize')).toHaveTextContent('A hardware key')
        expect(screen.getAllByTestId('board-row')).toHaveLength(2)
        expect(podium).toHaveTextContent('Cookie Monster')
        expect(podium).toHaveTextContent('ada')
        expect(podium).toHaveTextContent(/30/)
    })

    it('says when the standings are the frozen ones', () => {
        results.data = makeResults({ frozen: true })
        const { unmount } = renderView()
        expect(screen.getByTestId('results-frozen')).toHaveTextContent('Frozen standings')
        unmount()
        results.data = makeResults({ frozen: false })
        renderView()
        expect(screen.queryByTestId('results-frozen')).toBeNull()
    })

    describe('what the heading and the table call the standings', () => {
        const running = () => {
            const r = makeResults()
            r.competition.status = 'live'
            return r
        }

        it('says "final results" only when the competition has ended', () => {
            results.data = makeResults()
            renderView()
            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Winter CTF: final results')
            expect(screen.getByRole('table', { name: /Final standings/ })).toBeInTheDocument()
        })

        it('says "standings so far" when staff open the page while the competition runs', () => {
            vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-12-06T12:00:00.000Z'))
            try {
                results.data = running()
                renderView()
                expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Winter CTF: standings so far')
                expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('final')
                expect(screen.getByRole('table', { name: /Standings so far/ })).toBeInTheDocument()
                expect(screen.queryByRole('table', { name: /Final/ })).toBeNull()
            } finally { vi.useRealTimers() }
        })

        it('says "frozen standings" for a frozen board, even before the end', () => {
            results.data = { ...running(), frozen: true }
            renderView()
            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Winter CTF: frozen standings')
            expect(screen.getByRole('table', { name: /Frozen standings/ })).toBeInTheDocument()
        })

        it('counts a stale "live" status as ended once the end has passed', () => {
            vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-12-08T00:00:00.000Z'))
            try {
                results.data = running()
                renderView()
                expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('final results')
            } finally { vi.useRealTimers() }
        })
    })

    it('names a first blood and says when nobody solved a challenge', () => {
        results.data = makeResults()
        renderView()
        const text = screen.getByTestId('results').textContent ?? ''
        expect(text).toMatch(/First blood|first blood/)
        expect(text).toContain('Unsolved')
    })

    it('shows teams on the podium for a team competition', () => {
        const board = teamBoard().data
        results.data = makeResults({ mode: 'team', podium: board, standings: board, competition: { ...makeResults().competition, teamsEnabled: true } })
        renderView()
        expect(screen.getAllByTestId('podium-place')[0]).toHaveTextContent(/Red Pandas|Blue Foxes/)
        expect(screen.getByTestId('results')).toHaveTextContent(/Team competition/)
    })

    it('is a friendly wait before the end, with a link to the live board', () => {
        results.isError = true
        results.error = new ApiError('x', 409, 'CTF_RESULTS_NOT_AVAILABLE')
        detail.data = makeCompetition({ status: 'live' })
        renderView()
        const note = screen.getByTestId('results-not-ready')
        expect(note).toHaveTextContent('Results are available when the competition ends')
        expect(within(note).getByRole('link', { name: 'Live scoreboard' })).toHaveAttribute('href', '/ctf/competitions/winter-ctf?tab=scoreboard')
    })

    it('says so when the competition does not exist', () => {
        results.isError = true
        results.error = new ApiError('x', 404, 'CTF_NOT_FOUND')
        renderView()
        expect(screen.getByText('These results are not available')).toBeInTheDocument()
    })

    it('offers a retry on any other failure', () => {
        results.isError = true
        results.error = new ApiError('x', 500)
        renderView()
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load the results')
        expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument()
    })

    it('shows a skeleton while loading', () => {
        results.isLoading = true
        renderView()
        expect(screen.getByLabelText('Loading results')).toBeInTheDocument()
    })
})
