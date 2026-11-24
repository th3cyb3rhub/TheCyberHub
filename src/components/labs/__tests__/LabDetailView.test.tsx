import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeLab, makeViewer } from '@/lib/labs/__tests__/fixtures'

const auth = vi.hoisted(() => ({ current: { user: null as { id: string; role: string } | null, loading: false } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
const q = vi.hoisted(() => ({ lab: {} as Record<string, unknown> }))
const board = vi.hoisted(() => ({ rows: [] as unknown[] }))
const start = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useLabs', () => ({
    useLab: () => q.lab,
    useStartLab: () => start,
    useStopLab: () => ({ mutate: vi.fn(), isPending: false }),
    useUnlockHint: () => ({ mutate: vi.fn(), isPending: false }),
    useSubmitFlag: () => ({ mutate: vi.fn(), reset: vi.fn() }),
    useNextLabCards: () => ({ data: [], isLoading: false }),
    useLabLeaderboard: () => ({ data: board.rows, isLoading: false, isError: false }),
}))
vi.mock('@/components/internships/ViewerTime', () => ({ ViewerTime: ({ iso }: { iso: string }) => <time>{iso}</time> }))

import { LabDetailView } from '../LabDetailView'

const result = (data: unknown, extra = {}) => ({ data, isLoading: false, isPending: false, isError: false, isPlaceholderData: false, refetch: vi.fn(), ...extra })

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: null, loading: false }
})

describe('LabDetailView for a visitor', () => {
    it('shows the whole brief read-only with a sign-in prompt and no flag form', () => {
        q.lab = result(makeLab({ viewer: null }))
        render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        expect(screen.getByRole('heading', { level: 1, name: 'SQL Injection Basics' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Instructions' })).toBeInTheDocument()
        expect(screen.getByText('Find the flag.')).toBeInTheDocument()
        expect(screen.getByTestId('signin-prompt')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Sign in to start/ })).toHaveAttribute('href', '/auth?redirect=%2Flabs%2Fsql-injection-basics')
        expect(screen.queryByTestId('flag-form')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Start lab' })).not.toBeInTheDocument()
        expect(screen.getByTestId('hints-locked-note')).toBeInTheDocument()
    })

    it('shows the base points, the target link with its warning and the files with checksums', () => {
        q.lab = result(makeLab({ viewer: null }))
        render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        expect(screen.getByTestId('points-available')).toHaveTextContent('50')
        const target = screen.getByTestId('lab-target-link')
        expect(target).toHaveAttribute('href', 'https://target.example.org/login')
        expect(target).toHaveAttribute('target', '_blank')
        expect(target).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
        expect(screen.getByTestId('target-note')).toHaveTextContent('Use only this target')
        const file = screen.getByTestId('lab-file')
        expect(file).toHaveTextContent('app.zip')
        expect(file).toHaveTextContent('2 KB')
        expect(file).toHaveTextContent('a'.repeat(64))
        expect(screen.getByRole('link', { name: /Download app.zip/ })).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
    })

    it('drops a target and a file link that are not http or https', () => {
        q.lab = result(makeLab({ viewer: null, labUrl: 'javascript:alert(1)', files: [{ name: 'x.zip', url: 'data:text/html,hi', sizeBytes: null, sha256: null }] }))
        const { container } = render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        expect(screen.queryByTestId('lab-target-link')).not.toBeInTheDocument()
        expect(container.querySelector('a[href^="javascript"], a[href^="data"]')).toBeNull()
        expect(screen.getByText('Link unavailable')).toBeInTheDocument()
    })
})

describe('LabDetailView for a member', () => {
    beforeEach(() => { auth.current = { user: { id: 'u1', role: 'user' }, loading: false } })

    it('offers to start a lab that is not started, with no flag form yet', () => {
        q.lab = result(makeLab())
        render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        expect(screen.getByRole('button', { name: 'Start lab' })).toBeEnabled()
        expect(screen.queryByTestId('flag-form')).not.toBeInTheDocument()
    })

    it('shows progress, points left and the flag form once started, and the reset only when untouched', () => {
        q.lab = result(makeLab({ viewer: makeViewer({ myStatus: 'in-progress', startedAt: '2030-01-01T00:00:00Z', pointsAvailable: 50 }) }))
        const { unmount } = render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        expect(screen.getByTestId('flag-form')).toBeInTheDocument()
        expect(screen.getByTestId('points-now')).toHaveTextContent('50 of 50')
        expect(screen.getByRole('button', { name: /Reset my start/ })).toBeInTheDocument()
        unmount()
        q.lab = result(makeLab({ viewer: makeViewer({ myStatus: 'in-progress', startedAt: '2030-01-01T00:00:00Z', hintsUsed: 1, pointsAvailable: 40 }) }))
        render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        expect(screen.queryByRole('button', { name: /Reset my start/ })).not.toBeInTheDocument()
        expect(screen.getByTestId('points-now')).toHaveTextContent('40 of 50')
        expect(screen.getByTestId('points-available')).toHaveTextContent('40')
    })

    it('does not show reset after a wrong flag either', () => {
        q.lab = result(makeLab({ viewer: makeViewer({ myStatus: 'in-progress', attempts: 1, startedAt: '2030-01-01T00:00:00Z' }) }))
        render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        expect(screen.queryByRole('button', { name: /Reset my start/ })).not.toBeInTheDocument()
    })

    it('shows a completed lab with the points earned and no flag box', () => {
        q.lab = result(makeLab({ viewer: makeViewer({ myStatus: 'completed', pointsAwarded: 30, pointsAvailable: 30, completedAt: '2030-01-01T00:00:00Z' }) }))
        render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        expect(screen.getByTestId('completed-panel')).toHaveTextContent('30 points')
        expect(screen.queryByLabelText('Flag')).not.toBeInTheDocument()
    })

    it('shows a neutral panel, not the visitor one, while the member answer is on its way', () => {
        q.lab = result(makeLab({ viewer: null }), { isPlaceholderData: true })
        render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        expect(screen.getByTestId('progress-pending')).toBeInTheDocument()
        expect(screen.queryByTestId('signin-prompt')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Start lab' })).not.toBeInTheDocument()
    })

    it('tells staff what they are looking at and links to the editor', () => {
        q.lab = result(makeLab({ admin: { status: 'draft', flagCount: 0, pointsOverride: 0, startCount: 2 } }))
        render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        const note = screen.getByTestId('staff-note')
        expect(note).toHaveTextContent('This lab is draft')
        expect(note).toHaveTextContent('no flag')
        expect(screen.getByRole('link', { name: /Edit lab/ })).toHaveAttribute('href', '/admin/labs/sql-injection-basics/edit')
    })
})

describe('LabDetailView states', () => {
    it('says the lab is not available on a 404, with a way back', () => {
        q.lab = result(undefined, { isError: true, error: new ApiError('nope', 404, 'LAB_NOT_FOUND') })
        render(<LabDetailView slug="gone" initialLab={null} />)
        expect(screen.getByRole('heading', { name: 'This lab is not available' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Back to labs' })).toHaveAttribute('href', '/labs')
    })

    it('offers a retry on any other error', () => {
        q.lab = result(undefined, { isError: true, error: new ApiError('boom', 500) })
        render(<LabDetailView slug="x-lab" initialLab={null} />)
        expect(screen.getByRole('alert')).toHaveTextContent('boom')
        expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument()
    })

    it('shows a skeleton while it loads', () => {
        q.lab = result(undefined, { isLoading: true, isPending: true })
        render(<LabDetailView slug="x-lab" initialLab={null} />)
        expect(screen.getByRole('status', { name: 'Loading lab' })).toBeInTheDocument()
    })
})

describe('LabDetailView top solvers', () => {
    it('lists the best completions with name, username, points and hints only', () => {
        q.lab = result(makeLab({ viewer: null }))
        board.rows = [
            { rank: 1, user: { username: 'ada', name: 'Ada Lovelace', avatar: null }, pointsEarned: 50, hintsUsed: 0, completedAt: '2030-01-01T00:00:00Z' },
            { rank: 2, user: { username: 'linus', name: null, avatar: 'javascript:alert(1)' }, pointsEarned: 40, hintsUsed: 1, completedAt: '2030-01-02T00:00:00Z' },
        ]
        const { container } = render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        const rows = screen.getAllByTestId('solver-row')
        expect(rows).toHaveLength(2)
        expect(rows[0]).toHaveTextContent('Ada Lovelace')
        expect(rows[0]).toHaveTextContent('50 pts')
        expect(rows[1]).toHaveTextContent('1 hint')
        expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/user/ada')
        // A non-http avatar is never put in an image
        expect(container.querySelector('img[src^="javascript"]')).toBeNull()
        board.rows = []
    })

    it('invites the first solver when there are none', () => {
        q.lab = result(makeLab({ viewer: null }))
        render(<LabDetailView slug="sql-injection-basics" initialLab={null} />)
        expect(screen.getByTestId('top-solvers')).toHaveTextContent('Nobody has solved this lab yet')
    })
})
