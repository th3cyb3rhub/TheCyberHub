import { render, screen, within, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeCompetition, makeMe, makeTeam, soloBoard, teamBoard } from '@/lib/ctf/__tests__/fixtures'
import type { CtfLeaderboard } from '@/types/ctf'

const auth = vi.hoisted(() => ({ user: null as { id: string; username: string } | null }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, loading: false }) }))
const board = vi.hoisted(() => ({ data: undefined as CtfLeaderboard | undefined, isLoading: false, isError: false, error: null as unknown, isFetching: false, refetch: vi.fn() }))
const me = vi.hoisted(() => ({ data: undefined as unknown }))
const pushed = vi.hoisted(() => ({ value: false, calls: [] as { enabled: boolean }[] }))
vi.mock('@/hooks/queries/useCtf', () => ({
    useCtfLeaderboard: () => board,
    useCtfLiveBoard: (_slug: string, options: { enabled: boolean }) => { pushed.calls.push(options); return pushed.value },
    useCtfMe: () => me,
}))

import { ScoreboardPanel } from '../ScoreboardPanel'

const renderPanel = (over: Partial<Parameters<typeof ScoreboardPanel>[0]> = {}) =>
    render(<ScoreboardPanel competition={makeCompetition()} status="live" signedIn={false} {...over} />)

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = null
    board.data = soloBoard(); board.isLoading = false; board.isError = false; board.error = null; board.isFetching = false
    me.data = undefined
    pushed.value = false; pushed.calls = []
})

describe('ScoreboardPanel', () => {
    it('renders a solo board with rank, player, solves and points', () => {
        renderPanel()
        const table = screen.getByTestId('board-table')
        expect(within(table).getByRole('columnheader', { name: 'Player' })).toBeInTheDocument()
        const rows = screen.getAllByTestId('board-row')
        expect(rows).toHaveLength(2)
        expect(rows[0]).toHaveTextContent('ada')
        expect(rows[0]).toHaveTextContent('500')
        expect(rows[0]).toHaveTextContent('1 place')
        expect(screen.getByTestId('scoreboard')).toHaveAttribute('data-mode', 'solo')
    })

    it('renders a team board with the captain and the member count', () => {
        board.data = teamBoard()
        renderPanel({ competition: makeCompetition({ teamsEnabled: true }) })
        expect(screen.getByRole('columnheader', { name: 'Team' })).toBeInTheDocument()
        const first = screen.getAllByTestId('board-row')[0]
        expect(first).toHaveTextContent('Red Pandas')
        expect(first).toHaveTextContent('@captain')
        expect(first).toHaveTextContent('2 members')
        expect(screen.getByTestId('scoreboard')).toHaveAttribute('data-mode', 'team')
    })

    it('says the board is frozen, and says so in words, not colour alone', () => {
        board.data = soloBoard({ frozen: true, frozenAt: '2026-12-06T10:00:00.000Z' })
        renderPanel({ status: 'frozen' })
        const note = screen.getByTestId('frozen-note')
        expect(note).toHaveAttribute('role', 'status')
        expect(note).toHaveTextContent(/Frozen\./)
        expect(note).toHaveTextContent(/final standings appear when the competition ends/)
        expect(screen.getByRole('table', { name: /frozen/ })).toBeInTheDocument()
    })

    it('tells staff they see the live board while the competition is frozen', () => {
        board.data = soloBoard({ frozen: false })
        renderPanel({ status: 'frozen' })
        expect(screen.queryByTestId('frozen-note')).toBeNull()
        expect(screen.getByText(/because you are staff/)).toBeInTheDocument()
    })

    it('highlights the signed-in player and shows their standing', () => {
        auth.user = { id: 'u9', username: 'linus' }
        me.data = makeMe({ rank: 2, points: 300, solveCount: 3 })
        renderPanel({ signedIn: true })
        const mine = screen.getAllByTestId('board-row').find((r) => r.getAttribute('data-mine'))
        expect(mine).toHaveTextContent('linus')
        expect(mine).toHaveAttribute('aria-current', 'true')
        expect(screen.getByTestId('my-standing')).toHaveTextContent('Rank 2')
        expect(screen.getByTestId('my-standing')).toHaveTextContent('300 points')
    })

    it('highlights the team of the signed-in member', () => {
        board.data = teamBoard()
        auth.user = { id: 'u1', username: 'captain' }
        me.data = makeMe({ team: makeTeam({ _id: 't2', name: 'Blue Foxes' }), rank: 2 })
        renderPanel({ competition: makeCompetition({ teamsEnabled: true }), signedIn: true })
        const mine = screen.getAllByTestId('board-row').find((r) => r.getAttribute('data-mine'))
        expect(mine).toHaveTextContent('Blue Foxes')
        expect(mine).toHaveTextContent('Your team')
    })

    it('marks a rank of a frozen board', () => {
        auth.user = { id: 'u9', username: 'linus' }
        me.data = makeMe({ rank: 4, rankFrozen: true })
        renderPanel({ signedIn: true })
        expect(screen.getByTestId('my-standing')).toHaveTextContent('(frozen rank)')
    })

    it('says how the board stays fresh: pushed, polled or final', () => {
        const { unmount } = renderPanel()
        expect(screen.getByTestId('live-note')).toHaveTextContent(/refreshes about every 20 seconds/)
        unmount()
        pushed.value = true
        const second = renderPanel()
        expect(screen.getByTestId('live-note')).toHaveTextContent(/Live: the board updates/)
        second.unmount()
        renderPanel({ status: 'ended' })
        expect(screen.getByTestId('live-note')).toHaveTextContent('Final standings.')
        expect(screen.queryByRole('button', { name: /Refresh/ })).toBeNull()
    })

    it('does not rely on the socket while the board is frozen, and does while it is live', () => {
        const live = renderPanel({ status: 'live' })
        expect(pushed.calls.at(-1)?.enabled).toBe(true)
        live.unmount()
        renderPanel({ status: 'frozen' })
        expect(pushed.calls.at(-1)?.enabled).toBe(false)
        expect(screen.getByTestId('live-note')).toHaveTextContent(/refreshes about every 20 seconds/)
    })

    it('refreshes by hand', () => {
        renderPanel()
        fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
        expect(board.refetch).toHaveBeenCalled()
    })

    it('waits for the start, handles a cancelled competition, an empty board and a failure', () => {
        const waiting = renderPanel({ status: 'upcoming' })
        expect(screen.getByText('The scoreboard opens when the competition starts')).toBeInTheDocument()
        waiting.unmount()
        const cancelled = renderPanel({ status: 'cancelled' })
        expect(screen.getByText('This competition was cancelled')).toBeInTheDocument()
        cancelled.unmount()
        board.data = soloBoard({ data: [] })
        const empty = renderPanel()
        expect(screen.getByText('No scores yet')).toBeInTheDocument()
        empty.unmount()
        board.data = undefined; board.isError = true; board.error = new Error('down')
        renderPanel()
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load the scoreboard')
    })
})
