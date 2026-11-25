import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeViewer } from '@/lib/codeReview/__tests__/fixtures'
import { ProgressPanel } from '../ProgressPanel'
import { RulesBox } from '../RulesBox'

describe('ProgressPanel', () => {
  it('shows what a pass pays for a member', () => {
    render(<ProgressPanel viewer={makeViewer({ pointsAvailable: 22 })} staff={false} />)
    expect(screen.getByTestId('points-value')).toHaveTextContent('22 points')
  })

  it('never says a pass pays up to 0 points to staff: staff are not scored', () => {
    render(<ProgressPanel viewer={makeViewer({ pointsAvailable: 0 })} staff />)
    expect(screen.getByTestId('points-value')).toHaveTextContent('Not scored for staff')
    expect(screen.getByTestId('progress-panel')).not.toHaveTextContent(/0 points/)
  })

  it('says that probing took the points away, and that the exercise can still be passed', () => {
    render(<ProgressPanel viewer={makeViewer({ pointsAvailable: 0, pointsForfeited: true, solutionViewed: false })} staff={false} />)
    expect(screen.getByTestId('forfeited-note')).toHaveTextContent('more wrong marks than this exercise has findings')
    expect(screen.getByTestId('forfeited-note')).toHaveTextContent('still pass it for the practice')
  })

  it('keeps the solution message when the solution was opened', () => {
    render(<ProgressPanel viewer={makeViewer({ pointsAvailable: 0, pointsForfeited: true, solutionViewed: true })} staff={false} />)
    expect(screen.getByText(/You opened the solution, so a pass pays 0 points/)).toBeInTheDocument()
    expect(screen.queryByTestId('forfeited-note')).not.toBeInTheDocument()
  })
})

describe('RulesBox', () => {
  it('states the decay, the probe rule, the mark limits and when the details unlock', () => {
    render(<RulesBox points={25} findingCount={2} lineCount={30} />)
    const box = screen.getByTestId('rules-box')
    expect(box).toHaveTextContent('takes 25% off (at most 75%)')
    expect(screen.getByTestId('rule-probe')).toHaveTextContent('more wrong marks than the exercise has findings takes the points of the exercise away')
    // 2 findings: 4 marks; 40% of 30 lines is 12
    expect(screen.getByTestId('rule-caps')).toHaveTextContent('Here that is 4 marks and 12 lines')
    expect(screen.getByTestId('rule-caps')).toHaveTextContent('at most 40% of the lines (never fewer than 6)')
    expect(box).toHaveTextContent('unlocks when you pass or after you open the solution')
  })

  it('leaves out the numbers of this exercise when it has no code or findings yet', () => {
    render(<RulesBox points={25} findingCount={0} />)
    expect(screen.getByTestId('rule-caps')).not.toHaveTextContent('Here that is')
  })
})
