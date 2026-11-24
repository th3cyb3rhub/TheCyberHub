// @vitest-environment node
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import { makeCompetition } from '@/lib/ctf/__tests__/fixtures'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

import { CompetitionView } from '../CompetitionView'
import RulesPanel from '../RulesPanel'

const render = (competition: ReturnType<typeof makeCompetition> | null, initialTab?: string) => {
    expect(typeof window).toBe('undefined')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return renderToString(
        <QueryClientProvider client={client}><CompetitionView slug="winter-ctf" initialCompetition={competition} initialUpdatedAt={Date.now()} initialTab={initialTab} /></QueryClientProvider>,
    )
}

describe('CompetitionView rendered on the server', () => {
    it('renders the header, the facts and the tabs from the server copy without throwing', () => {
        const html = render(makeCompetition({ title: 'Winter CTF', shortDescription: 'A weekend of challenges', status: 'live' }))
        expect(html).toContain('Winter CTF')
        expect(html).toContain('A weekend of challenges')
        expect(html).toMatch(/Competition time zone: (<!-- -->)?Europe\/Berlin/)
        expect(html).toContain('role="tablist"')
        expect(html).toContain('Challenges')
        expect(html).toContain('Scoreboard')
        expect(html).toContain('Rules')
        // Solo: no team tab
        expect(html).not.toMatch(/>Team</)
    })

    it('shows the team tab only for a team competition', () => {
        const html = render(makeCompetition({ teamsEnabled: true, minTeamSize: 2, maxTeamSize: 4 }))
        expect(html).toMatch(/>Team</)
        expect(html).toContain('Teams of 2 to 4')
    })

    it('states the status the API sent, so a bot reads the same as a member before the clock is known', () => {
        expect(render(makeCompetition({ status: 'upcoming' }))).toContain('Upcoming')
        expect(render(makeCompetition({ status: 'ended' }))).toContain('Ended')
        expect(render(makeCompetition({ status: 'frozen', frozenAt: '2026-12-06T10:00:00.000Z' }))).toContain('Frozen')
    })

    it('renders the rules from the server copy as safe markup', () => {
        const competition = makeCompetition({ rules: '## Fair play\n\nBe kind.\n\n<script>alert(1)</script>' })
        const html = renderToString(<RulesPanel competition={competition} />)
        expect(html).toContain('Fair play')
        expect(html).toContain('Be kind.')
        expect(html).not.toContain('<script>alert(1)</script>')
    })

    it('renders a skeleton, not a crash, when there is no server copy', () => {
        const html = render(null)
        expect(html).toContain('Loading competition')
    })

    it('never puts a banner link that is not http on the page', () => {
        const html = render(makeCompetition({ image: 'javascript:alert(1)' }))
        expect(html).not.toContain('javascript:alert(1)')
    })
})
