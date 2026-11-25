import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDetail, makeResult, makeViewer } from '@/lib/codeReview/__tests__/fixtures'
import { createQueryClient } from '@/lib/queryClient'

const auth = vi.hoisted(() => ({ current: { user: { id: 'u1', role: 'user' } as { id: string; role: string } | null, loading: false, refreshUser: vi.fn() } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const api = vi.hoisted(() => ({
    getSnippet: vi.fn(), submitAttempt: vi.fn(), unlockHint: vi.fn(), getSolution: vi.fn(), listAttempts: vi.fn(),
}))
vi.mock('@/lib/api/codeReview', () => api)

import { crKeys } from '@/hooks/queries/useCodeReview'
import { ExerciseView } from '../ExerciseView'

/** An exercise opened by its id: the address is not the slug the answer carries */
const ID = '64f0a1b2c3d4e5f6a7b8c9d0'
const SLUG = 'sql-injection-login'

let qc: QueryClient
const renderById = () => render(<QueryClientProvider client={qc}><ExerciseView slug={ID} initialSnippet={null} /></QueryClientProvider>)
const line = (n: number) => document.getElementById(`cr-line-${n}`) as HTMLElement

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
    // The real defaults of the site (retries, refetch on reconnect), not a test-friendly client
    qc = createQueryClient()
    api.getSnippet.mockResolvedValueOnce(makeDetail({ slug: SLUG, viewer: makeViewer({ solutionUnlocked: false, attempts: 0, attemptsToday: 0, attemptsLeftToday: 30, status: 'not-started' }) }))
    // Any later read is still on its way, so what the screen shows is what the panels wrote to the cache
    api.getSnippet.mockImplementation(() => new Promise(() => undefined))
    api.listAttempts.mockResolvedValue([])
})

describe('an exercise opened by its id', () => {
    it('uses the address of the page for every call and every cache write, so each panel updates', async () => {
        api.submitAttempt.mockResolvedValue(makeResult({ attempts: 1, attemptsLeftToday: 29, bestPercent: 35, solutionUnlocked: true }))
        api.unlockHint.mockResolvedValue({ hint: { id: 'h1', order: 1, text: 'Look at the query.', cost: 3 }, alreadyUnlocked: false, recorded: true, hintsUsed: 1, hintCost: 3, pointsAvailable: 22 })
        api.getSolution.mockResolvedValue({
            _id: '1', slug: SLUG, title: 'T', findings: [], explanation: 'The query is built by concatenation.', fixedCode: '', exploitedCode: '', fixedExploitedCode: '', exploitExample: null, hints: [], viewer: null,
        })
        renderById()

        // The progress panel, from the answer that was read by id
        const progress = await screen.findByTestId('progress-panel')
        expect(api.getSnippet).toHaveBeenCalledWith(ID)
        expect(progress).toHaveTextContent('Attempts0')

        // Submit: the call uses the id and the progress panel shows the attempt
        fireEvent.click(line(4))
        fireEvent.click(screen.getByRole('button', { name: /Mark selection/ }))
        fireEvent.click(screen.getByTestId('submit-marks'))
        expect(await screen.findByTestId('result')).toBeInTheDocument()
        expect(api.submitAttempt).toHaveBeenCalledWith(ID, [{ lineStart: 4, lineEnd: 4 }])
        await waitFor(() => expect(screen.getByTestId('progress-panel')).toHaveTextContent('Attempts1'))
        expect(screen.getByTestId('progress-panel')).toHaveTextContent('Left today29 of 30')
        // The attempt list is asked for with the same reference
        await waitFor(() => expect(api.listAttempts).toHaveBeenCalledWith(ID))

        // The solution unlocked in the panel without a reload
        const solution = screen.getByTestId('solution-panel')
        expect(solution).not.toHaveTextContent('locked until your first graded attempt')

        // A hint: the call uses the id, the text appears and the points left drop
        fireEvent.click(screen.getByRole('button', { name: 'Open hint 1' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Open for/ }))
        await waitFor(() => expect(api.unlockHint).toHaveBeenCalled()); expect(await screen.findByText('Look at the query.')).toBeInTheDocument()
        expect(api.unlockHint).toHaveBeenCalledWith(ID, 1)
        await waitFor(() => expect(screen.getByTestId('progress-panel')).toHaveTextContent('A pass pays up to22 points'))

        // The solution: asked once, with the id, after the warning
        fireEvent.click(within(solution).getByRole('button', { name: /Show solution/ }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open the solution' }))
        expect(await screen.findByTestId('solution-body')).toHaveTextContent('built by concatenation')
        expect(api.getSolution).toHaveBeenCalledTimes(1)
        expect(api.getSolution).toHaveBeenCalledWith(ID)

        // Every cache entry of the exercise is under the address of the page; none was made under the slug
        const detailRefs = qc.getQueryCache().findAll({ queryKey: crKeys.details() }).map((q) => q.queryKey[2])
        expect(detailRefs).toEqual([ID])
        expect(qc.getQueryData(crKeys.detail(SLUG, 'u1'))).toBeUndefined()
        for (const call of [api.submitAttempt, api.unlockHint, api.getSolution]) expect(call.mock.calls.every((c) => c[0] === ID)).toBe(true)
    })

    it('links the sign-in return address to the slug the answer carries', async () => {
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        api.getSnippet.mockReset()
        api.getSnippet.mockResolvedValue(makeDetail({ slug: SLUG, viewer: null }))
        renderById()
        const link = await screen.findByRole('link', { name: /Sign in to submit/ })
        expect(link.getAttribute('href')).toBe(`/auth?redirect=${encodeURIComponent(`/code-review/${SLUG}`)}`)
    })
})
