import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeResult } from '@/lib/codeReview/__tests__/fixtures'
import { ResultView } from '../ResultView'

const marks = [{ lineStart: 4, lineEnd: 5, vulnerabilityType: 'xss' }, { lineStart: 1, lineEnd: 1 }]
const view = (result = makeResult(), extra: Partial<React.ComponentProps<typeof ResultView>> = {}) =>
    render(<ResultView result={result} marks={marks} findingCount={2} staff={false} solutionViewed={false} {...extra} />)

describe('ResultView', () => {
    it('shows the score, the percent and that it did not pass, with the line to reach', () => {
        view()
        expect(screen.getByTestId('score')).toHaveTextContent('7 of 20 points (35%)')
        expect(screen.getByTestId('pass-state')).toHaveTextContent('Not passed yet')
        expect(screen.getByRole('img', { name: 'Score 35 percent. A pass needs 70 percent.' })).toBeInTheDocument()
        expect(screen.getByTestId('result')).toHaveAttribute('data-passed', 'false')
    })

    it('counts what was found, missed and wrong, and never shows what was missed', () => {
        view()
        expect(screen.getByTestId('found-count')).toHaveTextContent('1 of 2')
        expect(screen.getByTestId('missed-count')).toHaveTextContent('1')
        expect(screen.getByTestId('false-count')).toHaveTextContent('1')
        expect(screen.getByText(/The findings you missed are not shown/)).toBeInTheDocument()
        // only the one matched finding is described
        expect(screen.getAllByTestId('finding')).toHaveLength(1)
    })

    it('explains each matched finding, with severity, CWE link and the effect of the type', () => {
        view()
        const finding = screen.getByTestId('finding')
        expect(finding).toHaveTextContent('SQL injection')
        expect(finding).toHaveTextContent('Lines 4 to 5'.toLowerCase())
        expect(within(finding).getByText('Critical severity')).toBeInTheDocument()
        expect(within(finding).getByText('The name is concatenated into the query.')).toBeInTheDocument()
        const cwe = within(finding).getByRole('link', { name: /CWE-89/ })
        expect(cwe).toHaveAttribute('href', 'https://cwe.mitre.org/data/definitions/89.html')
        expect(cwe).toHaveAttribute('rel', 'noopener noreferrer nofollow')
        expect(screen.getByTestId('finding-points')).toHaveTextContent('+7 points')
        expect(screen.getByTestId('finding-points')).toHaveTextContent('earns 70% of the points')
    })

    it('says what happened to each mark, in the order they were sent', () => {
        view(makeResult({ marks: [{ index: 0, result: 'duplicate' }, { index: 1, result: 'unmatched' }] }))
        const verdicts = screen.getByTestId('mark-verdicts').querySelectorAll('li')
        expect(verdicts[0]).toHaveAttribute('data-verdict', 'duplicate')
        expect(verdicts[0]).toHaveTextContent('Lines 4 to 5: Repeat of a mark that already matched (free)')
        expect(verdicts[1]).toHaveAttribute('data-verdict', 'unmatched')
        expect(verdicts[1]).toHaveTextContent('Line 1: Matched nothing (costs 3 points)')
    })

    it('treats a mark the server did not mention as unmatched', () => {
        view(makeResult({ marks: [] }))
        expect(screen.getByTestId('mark-verdicts').querySelectorAll('li')[0]).toHaveAttribute('data-verdict', 'unmatched')
    })

    it('a first pass shows the points paid and the new badges', () => {
        view(makeResult({ passed: true, firstPass: true, pointsAwarded: 20, percent: 100, score: 20, falsePositives: 0, missedCount: 0, newBadges: [{ code: 'hunter', name: 'Bug Hunter', icon: null, rarity: 'rare' }] }))
        expect(screen.getByTestId('pass-state')).toHaveTextContent('Passed')
        expect(screen.getByTestId('points-line')).toHaveTextContent('You earned 20 points for this first pass.')
        expect(screen.getByTestId('new-badges')).toHaveTextContent('Bug Hunter (rare)')
        expect(screen.queryByText(/missed are not shown/)).not.toBeInTheDocument()
    })

    it('a later pass says no more points are paid', () => {
        view(makeResult({ passed: true, firstPass: false, pointsAwarded: 0 }))
        expect(screen.getByTestId('points-line')).toHaveTextContent('Points are paid once')
    })

    it('a first pass that paid nothing says why: the solution was opened, or staff', () => {
        const { unmount } = view(makeResult({ passed: true, firstPass: true, pointsAwarded: 0 }), { solutionViewed: true })
        expect(screen.getByTestId('points-line')).toHaveTextContent('opened the solution before passing')
        unmount()
        view(makeResult({ passed: true, firstPass: true, pointsAwarded: 0 }), { staff: true })
        expect(screen.getByTestId('points-line')).toHaveTextContent('never earn points')
    })

    it('says what a pass would still pay and how many attempts are left', () => {
        view(makeResult({ pointsAvailable: 22, attempts: 3, attemptsLeftToday: 27, hintsUsed: 1 }))
        expect(screen.getByTestId('points-line')).toHaveTextContent('up to 22 points')
        expect(screen.getByTestId('points-line')).toHaveTextContent('3 graded attempts so far, 27 left today')
        expect(screen.getByTestId('points-line')).toHaveTextContent('1 hint opened')
    })

    it('says no points are left when the solution was opened', () => {
        view(makeResult({ pointsAvailable: 0 }))
        expect(screen.getByTestId('points-line')).toHaveTextContent('No points can be earned')
    })

    it('shows fractional scores with one decimal', () => {
        view(makeResult({ score: 9.333, maxScore: 20, percent: 47 }))
        expect(screen.getByTestId('score')).toHaveTextContent('9.3 of 20')
    })

    it('shows text from the API as text', () => {
        const hostile = makeResult().matched[0]
        view(makeResult({ matched: [{ ...hostile, title: '<img src=x onerror=alert(1)>', explanation: '<script>alert(1)</script> explains' }] }))
        expect(document.querySelector('img')).toBeNull()
        expect(document.querySelector('script')).toBeNull()
        expect(screen.getByTestId('finding')).toHaveTextContent('<img src=x onerror=alert(1)>')
    })

    describe('before a pass: counts and a verdict for each mark, no explanations', () => {
        const hidden = (over = {}) => makeResult({ detailsRevealed: false, matchedCount: 1, matched: [], marks: [{ index: 0, result: 'matched' }, { index: 1, result: 'unmatched' }], duplicateCount: 0, ...over })

        it('says "N of M found" from the count and shows no finding', () => {
            view(hidden())
            expect(screen.getByTestId('found-count')).toHaveTextContent('1 of 2 found')
            expect(screen.queryAllByTestId('finding')).toHaveLength(0)
            expect(screen.queryByText('Findings you found')).not.toBeInTheDocument()
        })

        it('explains that the details unlock on a pass or after opening the solution', () => {
            view(hidden())
            expect(screen.getByTestId('details-locked')).toHaveTextContent('unlock when you pass or after you open the solution')
        })

        it('does not say a mark cost points when a repeat may be among the unmatched', () => {
            view(hidden())
            const verdicts = screen.getByTestId('mark-verdicts').querySelectorAll('li')
            expect(verdicts[0]).toHaveTextContent('Matched a finding')
            expect(verdicts[1]).toHaveAttribute('data-verdict', 'unmatched')
            expect(verdicts[1]).toHaveTextContent('Did not match a new finding')
            expect(verdicts[1]).not.toHaveTextContent('costs')
        })

        it('says how much the wrong marks cost and that repeats are free', () => {
            view(hidden({ falsePositives: 1, duplicateCount: 2 }))
            expect(screen.getByTestId('false-cost')).toHaveTextContent('1 mark matched nothing and cost 3 points in total')
            expect(screen.getByTestId('false-cost')).toHaveTextContent('2 repeats of a mark that already matched were free')
        })

        it('is not shown once the server reveals the details', () => {
            view(makeResult())
            expect(screen.queryByTestId('details-locked')).not.toBeInTheDocument()
            expect(screen.getAllByTestId('finding')).toHaveLength(1)
        })
    })

    it('says plainly when an attempt probed: more wrong marks than findings takes the points away', () => {
        view(makeResult({ pointsForfeited: true, falsePositives: 3, pointsAvailable: 0 }))
        const note = screen.getByTestId('forfeited')
        expect(note).toHaveTextContent('3 wrong marks, more than the 2 findings of this exercise')
        expect(note).toHaveTextContent('takes the points of the exercise away')
        expect(note).toHaveTextContent('still pass it for the practice')
    })

    it('has no forfeit note for an ordinary attempt, and states the new decay', () => {
        view(makeResult({ pointsAvailable: 22 }))
        expect(screen.queryByTestId('forfeited')).not.toBeInTheDocument()
        expect(screen.getByTestId('points-line')).toHaveTextContent('takes 25% off, up to 75%')
    })
})
