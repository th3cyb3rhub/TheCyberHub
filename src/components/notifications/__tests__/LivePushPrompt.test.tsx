import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ liveArrivals: 0, pathname: '/dashboard' }))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))
vi.mock('@/context/NotificationProvider', () => ({ useNotificationSocket: () => ({ liveArrivals: state.liveArrivals }) }))
vi.mock('../PushPrompt', () => ({ default: ({ source }: { source: string }) => <div data-testid="prompt">{source}</div> }))

import LivePushPrompt from '../LivePushPrompt'

beforeEach(() => { state.liveArrivals = 0; state.pathname = '/dashboard' })

describe('LivePushPrompt', () => {
    it('stays away on a plain page load', () => {
        render(<LivePushPrompt />)
        expect(screen.queryByTestId('prompt')).toBeNull()
    })

    it('appears once a notification has arrived', () => {
        state.liveArrivals = 1
        render(<LivePushPrompt />)
        expect(screen.getByTestId('prompt')).toHaveTextContent('first_notification')
    })

    it('leaves the notifications page to its own prompt', () => {
        state.liveArrivals = 2
        state.pathname = '/notifications'
        render(<LivePushPrompt />)
        expect(screen.queryByTestId('prompt')).toBeNull()
    })
})
