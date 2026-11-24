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
