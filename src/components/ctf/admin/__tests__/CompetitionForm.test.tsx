import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeCompetition } from '@/lib/ctf/__tests__/fixtures'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
type Callbacks = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void }
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }))
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }))
const cancel = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }))
const remove = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }))
const add = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }))
const take = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }))
const order = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }))
const PICKER = [
    { _id: 'p1', title: 'Cookie Monster', category: 'web-security', difficulty: 'easy', basePoints: 100, status: 'active' },
    { _id: 'p2', title: 'Padding Oracle', category: 'cryptography', difficulty: 'hard', basePoints: 300, status: 'active' },
    { _id: 'p3', title: 'Unfinished Draft', category: 'forensics', difficulty: 'easy', basePoints: 50, status: 'draft' },
]
vi.mock('@/hooks/queries/useCtf', () => ({
    useCreateCtf: () => create, useUpdateCtf: () => update, useCancelCtf: () => cancel, useDeleteCtf: () => remove,
    useAddCtfChallenge: () => add, useRemoveCtfChallenge: () => take, useSetCtfChallenges: () => order,
    useCtfPickerChallenges: () => ({ data: { items: PICKER, hasMore: false }, isLoading: false, isError: false, refetch: vi.fn() }),
}))

import { CompetitionForm } from '../CompetitionForm'

const field = (label: string | RegExp) => screen.getByLabelText(typeof label === 'string' ? new RegExp(`^${label}(?![\\w])`) : label)
const fill = (label: string | RegExp, value: string) => fireEvent.change(field(label), { target: { value } })
const submit = () => fireEvent.click(screen.getByRole('button', { name: /Save draft|Save changes|Create and publish/ }))
const call = (m: { mutate: ReturnType<typeof vi.fn> }) => m.mutate.mock.calls[m.mutate.mock.calls.length - 1] as [Record<string, unknown>, Callbacks]
const fillBasics = () => {
    fill('Title', 'Winter CTF')
    fill('Description', 'Solve things.')
    fill('Time zone', 'UTC')
    fill('Start, date', '2026-12-05'); fill('Start, time', '10:00')
    fill('End, date', '2026-12-07'); fill('End, time', '10:00')
}
const staffCompetition = (over = {}) => makeCompetition({
    _id: 'c1', status: 'upcoming', isPublic: true, timezone: 'UTC',
    startDate: '2026-12-05T10:00:00.000Z', endDate: '2026-12-07T10:00:00.000Z',
    challenges: ['ch1', 'ch2'],
    challengeDetails: [
        { _id: 'ch1', position: 0, title: 'Cookie Monster', category: 'web-security', difficulty: 'easy', basePoints: 100, status: 'active', solveCount: 0 },
        { _id: 'ch2', position: 1, title: 'Padding Oracle', category: 'cryptography', difficulty: 'hard', basePoints: 300, status: 'active', solveCount: 4 },
    ],
    ...over,
})

beforeEach(() => {
    vi.clearAllMocks()
    for (const m of [create, update, cancel, remove, add, take, order]) m.isPending = false
})

describe('CompetitionForm (create)', () => {
    it('sends a new draft with ISO instants and leaves blank optional fields out', () => {
        render(<CompetitionForm />)
        fillBasics()
        submit()
        expect(create.mutate).toHaveBeenCalledTimes(1)
        const payload = call(create)[0]
        expect(payload).toMatchObject({ title: 'Winter CTF', description: 'Solve things.', status: 'draft', startDate: '2026-12-05T10:00:00.000Z', endDate: '2026-12-07T10:00:00.000Z', timezone: 'UTC' })
        for (const key of ['slug', 'image', 'rules', 'prizes', 'challenges', 'frozenAt', 'minTeamSize']) expect(key in payload).toBe(false)
    })

    it('shows field errors and sends nothing when the form is empty', () => {
        render(<CompetitionForm />)
        submit()
        expect(create.mutate).not.toHaveBeenCalled()
        expect(field('Title')).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByTestId('form-error')).toHaveTextContent(/Please fix 4 things/)
        expect(screen.getAllByText(/Choose the (start|end) date and time/)).toHaveLength(2)
    })

    it('refuses an end before the start, and a freeze outside the window', () => {
        render(<CompetitionForm />)
        fillBasics()
        fill('End, date', '2026-12-01')
        submit()
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByText('End date must be after start date')).toBeInTheDocument()
        fill('End, date', '2026-12-07')
        fill('Freeze the board at, date', '2026-12-09'); fill('Freeze the board at, time', '10:00')
        submit()
        expect(screen.getByText('The freeze time must be between the start and the end')).toBeInTheDocument()
        expect(create.mutate).not.toHaveBeenCalled()
    })

    it('asks for team sizes only while teams are on, and checks them', () => {
        render(<CompetitionForm />)
        expect(screen.queryByTestId('team-sizes')).toBeNull()
        fireEvent.click(screen.getByLabelText(/Teams play together/))
        expect(screen.getByTestId('team-sizes')).toBeInTheDocument()
        fillBasics()
        fill(/Smallest team/, '6'); fill('Largest team', '4')
        submit()
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByText('The smallest team cannot be larger than the largest')).toBeInTheDocument()
        fill(/Smallest team/, '2')
        submit()
        expect(call(create)[0]).toMatchObject({ teamsEnabled: true, minTeamSize: 2, maxTeamSize: 4 })
    })

    it('explains dynamic scoring with the table and what awarding points does', () => {
        render(<CompetitionForm />)
        expect(screen.getByTestId('scoring-preview')).toHaveTextContent(/Static scoring/)
        fill('Scoring mode', 'dynamic')
        const preview = screen.getByTestId('scoring-preview')
        expect(within(preview).getByRole('table')).toBeInTheDocument()
        expect(preview).toHaveTextContent(/never falls below 25 %/)
        expect(preview).toHaveTextContent(/not on the global leaderboard/)
        fireEvent.click(screen.getByLabelText(/Solves also count on the global leaderboard/))
        expect(preview).toHaveTextContent(/count on the global leaderboard/)
        fillBasics()
        submit()
        expect(call(create)[0]).toMatchObject({ scoringMode: 'dynamic', awardsPoints: true })
    })

    it('edits prizes as place and reward rows, at most ten', () => {
        render(<CompetitionForm />)
        fireEvent.click(screen.getByRole('button', { name: 'Add a prize' }))
        expect(field(/Prize for 1st place/)).toBeInTheDocument()
        fill(/Prize for 1st place/, 'A hardware key')
        for (let i = 0; i < 9; i++) fireEvent.click(screen.getByRole('button', { name: 'Add a prize' }))
        expect(screen.getByRole('button', { name: 'Add a prize' })).toBeDisabled()
        expect(screen.getAllByTestId('prize-row')).toHaveLength(10)
        for (let i = 0; i < 9; i++) fireEvent.click(screen.getAllByRole('button', { name: /Remove the prize/ })[1])
        fillBasics()
        submit()
        expect(call(create)[0].prizes).toEqual([{ place: 1, reward: 'A hardware key' }])
    })

    it('flags an empty prize and a banner link that is not http', () => {
        render(<CompetitionForm />)
        fillBasics()
        fireEvent.click(screen.getByRole('button', { name: 'Add a prize' }))
        fill('Banner image', 'javascript:alert(1)')
        submit()
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByText('Describe the prize')).toBeInTheDocument()
        expect(screen.getByText('Use a public link that starts with http:// or https://')).toBeInTheDocument()
    })

    it('previews the rules as inert markdown', () => {
        const { container } = render(<CompetitionForm />)
        fireEvent.change(document.getElementById('rules') as HTMLTextAreaElement, { target: { value: '## Fair play\n\n<script>alert(1)</script> <img src=x onerror=alert(2)> [x](javascript:alert(3))' } })
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
        const preview = screen.getByTestId('rules-preview')
        expect(within(preview).getByRole('heading', { name: 'Fair play' })).toBeInTheDocument()
        expect(preview.querySelector('script')).toBeNull()
        expect(preview.querySelector('img')).toBeNull()
        expect(preview.querySelector('[onerror]')).toBeNull()
        expect(preview.querySelector('a[href^="javascript"]')).toBeNull()
        expect(container.querySelector('script')).toBeNull()
    })

    it('picks challenges, keeps their order and sends the ids', () => {
        render(<CompetitionForm />)
        fireEvent.click(screen.getByRole('button', { name: /Add Padding Oracle/ }))
        fireEvent.click(screen.getByRole('button', { name: /Add Cookie Monster/ }))
        expect(screen.getAllByTestId('set-row').map((r) => r.getAttribute('data-id'))).toEqual(['p2', 'p1'])
        fireEvent.click(screen.getByRole('button', { name: 'Move Cookie Monster up' }))
        expect(screen.getAllByTestId('set-row').map((r) => r.getAttribute('data-id'))).toEqual(['p1', 'p2'])
        expect(screen.getByRole('button', { name: 'Cookie Monster is in the set' })).toHaveAttribute('aria-disabled', 'true')
        fillBasics()
        submit()
        expect(call(create)[0].challenges).toEqual(['p1', 'p2'])
        fireEvent.click(screen.getByRole('button', { name: 'Remove Padding Oracle' }))
        expect(screen.getAllByTestId('set-row')).toHaveLength(1)
    })

    it('marks a draft challenge in the picker and lets it be added', () => {
        render(<CompetitionForm />)
        expect(screen.getByTestId('picker')).toHaveTextContent('Draft challenge')
        fireEvent.click(screen.getByRole('button', { name: 'Add Unfinished Draft' }))
        expect(screen.getAllByTestId('set-row').map((r) => r.getAttribute('data-id'))).toEqual(['p3'])
    })

    it('labels the visibility switch Unlisted (link only) and sends isPublic the right way round', () => {
        render(<CompetitionForm />)
        const box = screen.getByLabelText(/Unlisted \(link only\)/)
        expect(box).not.toBeChecked()
        fireEvent.click(box)
        fillBasics()
        submit()
        expect(call(create)[0]).toMatchObject({ isPublic: false })
    })

    it('goes to the list after a save and shows the server message for field errors', () => {
        render(<CompetitionForm />)
        fillBasics()
        submit()
        act(() => {
            call(create)[1].onError?.(new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [
                { field: 'endDate', message: 'End date must be after start date' },
                { field: 'prizes.0.reward', message: 'Too long' },
                { field: 'createdBy', message: 'Not allowed' },
            ]))
        })
        expect(screen.getByText('End date must be after start date')).toBeInTheDocument()
        expect(screen.getByTestId('form-error-lines')).toHaveTextContent('CreatedBy: Not allowed')
        submit()
        act(() => { call(create)[1].onSuccess?.({}) })
        expect(push).toHaveBeenCalledWith('/admin/ctf')
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
    })

    it('puts a taken slug on the slug box', () => {
        render(<CompetitionForm />)
        fillBasics()
        fill('Slug', 'taken')
        submit()
        act(() => { call(create)[1].onError?.(new ApiError('x', 409, 'CTF_SLUG_TAKEN')) })
        expect(field('Slug')).toHaveAttribute('aria-invalid', 'true')
        expect(document.getElementById('slug-error')).toHaveTextContent(/Another competition already uses this slug/)
    })

    it('holds back a person who typed something and tries to leave the tab', () => {
        render(<CompetitionForm />)
        const clean = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(clean)
        expect(clean.defaultPrevented).toBe(false)
        fill('Title', 'Winter CTF')
        const dirty = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(dirty)
        expect(dirty.defaultPrevented).toBe(true)
    })
})

describe('CompetitionForm (edit)', () => {
    it('sends only what changed, by id', () => {
        render(<CompetitionForm competition={staffCompetition()} />)
        fill('Title', 'Winter CTF 2')
        fireEvent.click(screen.getByLabelText(/Registration is open/))
        submit()
        expect(update.mutate).toHaveBeenCalledTimes(1)
        const [vars] = call(update)
        expect(vars).toEqual({ id: 'c1', payload: { title: 'Winter CTF 2', registrationOpen: false } })
    })

    it('says so and sends nothing when nothing changed', () => {
        render(<CompetitionForm competition={staffCompetition()} />)
        submit()
        expect(update.mutate).not.toHaveBeenCalled()
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'info' }))
    })

    it('shows the stored values, in the competition zone', () => {
        render(<CompetitionForm competition={staffCompetition({ timezone: 'Europe/Berlin' })} />)
        expect(field('Start, date')).toHaveValue('2026-12-05')
        expect(field('Start, time')).toHaveValue('11:00')
        expect(field('Time zone')).toHaveValue('Europe/Berlin')
    })

    it('keeps the same moment when only the zone changes', () => {
        render(<CompetitionForm competition={staffCompetition()} />)
        fill('Time zone', 'Asia/Tokyo')
        expect(field('Start, time')).toHaveValue('19:00')
        submit()
        expect(call(update)[0]).toEqual({ id: 'c1', payload: { timezone: 'Asia/Tokyo' } })
    })

    it('marks the fields CTF_LOCKED names, puts them back and locks them', () => {
        render(<CompetitionForm competition={staffCompetition()} />)
        fireEvent.click(screen.getByLabelText(/Teams play together/))
        fill('Scoring mode', 'dynamic')
        submit()
        act(() => { call(update)[1].onError?.(new ApiError('x', 409, 'CTF_LOCKED', undefined, { fields: ['teamsEnabled', 'scoringMode'] })) })
        expect(screen.getByTestId('form-error')).toHaveTextContent(/team play and the scoring mode/)
        expect(screen.getByLabelText(/Teams play together/)).not.toBeChecked()
        expect(screen.getByLabelText(/Teams play together/)).toBeDisabled()
        expect(field('Scoring mode')).toHaveValue('static')
        expect(field('Scoring mode')).toBeDisabled()
        // Nothing is left to save
        update.mutate.mockClear()
        submit()
        expect(update.mutate).not.toHaveBeenCalled()
    })

    it('does not offer teams or scoring changes once players have solved something', () => {
        render(<CompetitionForm competition={staffCompetition()} />)
        expect(screen.getByLabelText(/Teams play together/)).toBeDisabled()
        expect(field('Scoring mode')).toBeDisabled()
    })

    it('offers the ended and cancelled states only where they make sense', () => {
        const { unmount } = render(<CompetitionForm competition={staffCompetition()} />)
        expect(within(field('Status')).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual(['draft', 'published', 'ended'])
        expect(screen.getByRole('button', { name: /Cancel competition/ })).toBeInTheDocument()
        unmount()
        render(<CompetitionForm competition={staffCompetition({ status: 'cancelled' })} />)
        expect(within(field('Status')).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual(['draft', 'published', 'ended', 'cancelled'])
        expect(screen.queryByRole('button', { name: /Cancel competition/ })).toBeNull()
    })

    it('asks before cancelling, then cancels', () => {
        render(<CompetitionForm competition={staffCompetition()} />)
        fireEvent.click(screen.getByRole('button', { name: /Cancel competition/ }))
        const dialog = screen.getByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel competition' }))
        expect(cancel.mutate).toHaveBeenCalledWith({ id: 'c1' }, expect.any(Object))
        act(() => { call(cancel)[1].onSuccess?.({}) })
        expect(push).toHaveBeenCalledWith('/admin/ctf')
    })

    it('says a competition with solves is cancelled instead of deleted', () => {
        render(<CompetitionForm competition={staffCompetition()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent(/cannot be deleted: it is cancelled instead/)
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel it instead' }))
        expect(remove.mutate).toHaveBeenCalledWith({ id: 'c1' }, expect.any(Object))
        act(() => { call(remove)[1].onSuccess?.({ deleted: false, cancelled: true, status: 'cancelled' }) })
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'info', message: expect.stringMatching(/cancelled instead/) }))
    })

    it('deletes a competition nobody has scored in', () => {
        const none = staffCompetition({ challengeDetails: [{ _id: 'ch1', position: 0, title: 'Cookie Monster', solveCount: 0 }], challenges: ['ch1'] })
        render(<CompetitionForm competition={none} />)
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent(/removed for good/)
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete competition' }))
        act(() => { call(remove)[1].onSuccess?.({ deleted: true, cancelled: false, status: 'draft' }) })
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Competition deleted.' }))
    })
})

describe('challenge set of a saved competition', () => {
    it('lists the set in order with solve counts and blocks removing a solved challenge', () => {
        render(<CompetitionForm competition={staffCompetition()} />)
        const rows = screen.getAllByTestId('set-row')
        expect(rows.map((r) => r.getAttribute('data-id'))).toEqual(['ch1', 'ch2'])
        expect(rows[1]).toHaveTextContent('4 solves: it cannot be removed')
        expect(screen.getByRole('button', { name: 'Padding Oracle has solves and cannot be removed' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('button', { name: 'Remove Cookie Monster' })).not.toHaveAttribute('aria-disabled')
    })

    it('reorders and removes with the API calls, at once', () => {
        render(<CompetitionForm competition={staffCompetition()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Move Cookie Monster down' }))
        expect(order.mutate).toHaveBeenCalledWith({ id: 'c1', challenges: ['ch2', 'ch1'] }, expect.any(Object))
        fireEvent.click(screen.getByRole('button', { name: 'Remove Cookie Monster' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove challenge' }))
        expect(take.mutate).toHaveBeenCalledWith({ id: 'c1', challengeId: 'ch1' }, expect.any(Object))
    })

    it('adds a challenge that is not in the set yet', () => {
        const small = staffCompetition({ challenges: ['ch1'], challengeDetails: [{ _id: 'ch1', position: 0, title: 'Cookie Monster', solveCount: 0 }] })
        render(<CompetitionForm competition={small} />)
        fireEvent.click(screen.getByRole('button', { name: /Add Padding Oracle/ }))
        expect(add.mutate).toHaveBeenCalledWith({ id: 'c1', challengeId: 'p2' }, expect.any(Object))
    })

    it('maps CTF_CHALLENGE_HAS_SOLVES to the challenge names', () => {
        const none = staffCompetition({ challengeDetails: [
            { _id: 'ch1', position: 0, title: 'Cookie Monster', solveCount: 0 }, { _id: 'ch2', position: 1, title: 'Padding Oracle', solveCount: 0 },
        ] })
        render(<CompetitionForm competition={none} />)
        fireEvent.click(screen.getByRole('button', { name: 'Remove Padding Oracle' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove challenge' }))
        act(() => { call(take)[1].onError?.(new ApiError('x', 409, 'CTF_CHALLENGE_HAS_SOLVES', undefined, { challenges: ['ch2'] })) })
        expect(screen.getByTestId('set-error')).toHaveTextContent(/has solves cannot be removed.*Padding Oracle/)
    })
})

