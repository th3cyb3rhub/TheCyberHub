import { renderToString } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import { makeEvent } from '@/lib/events/__tests__/fixtures'

// The event page lists `events/[slug]` among the pages whose content is in the server HTML. This is the
// proof for the part that used to wait for the browser: the organizer's description.
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: true }) }))
const q = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const idle = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useEvents', () => ({
    useEvent: () => q.current,
    useApproveEvent: () => idle,
    useRejectEvent: () => idle,
    useRegisterForEvent: () => idle,
    useUnregisterFromEvent: () => idle,
    useJoinWaitlist: () => idle,
    useLeaveWaitlist: () => idle,
    useSetReminder: () => idle,
    useEventFeedback: () => ({ isLoading: false, isError: false, data: { feedback: [], totalReviews: 0, averageRating: 0 } }),
    useSubmitEventFeedback: () => idle,
    useEventAttendees: () => ({ isLoading: false, isError: false, isSuccess: true, hasNextPage: false, data: { pages: [] } }),
    useMarkAttendance: () => idle,
    useCancelEvent: () => idle,
}))
vi.mock('@/hooks/queries/useEventCalendar', () => ({
    useExportAttendees: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
    useUndoAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/components/ui/ReportContentButton', () => ({ ReportContentButton: () => null }))

import { EventDetailView } from '../EventDetailView'

describe('the event page on the server', () => {
    it('has the title and the description text in the HTML, escaped', () => {
        q.current = { data: makeEvent({ description: 'Bring a **laptop** and <script>alert(1)</script> curiosity' }), isError: false, isLoading: false, refetch: vi.fn() }
        const html = renderToString(<EventDetailView slug="winter-ctf-night" />)
        expect(html).toContain('Winter CTF Night')
        expect(html).toMatch(/<strong[^>]*>laptop<\/strong>/)
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
        expect(html).not.toContain('<script>alert(1)')
    })
})
