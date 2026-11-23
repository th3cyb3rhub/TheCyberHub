import { render, screen, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const addToast = vi.fn()
vi.mock('../ToastContext', () => ({ useToast: () => ({ addToast }) }))
vi.mock('../AuthContext', () => ({ useAuth: () => ({ token: 'tkn', user: { id: 'u1' } }) }))

const handlers: Record<string, (data?: unknown) => void> = {}
const fakeSocket = {
    on: (event: string, fn: (data?: unknown) => void) => { handlers[event] = fn },
    off: vi.fn(),
    disconnect: vi.fn(),
}
vi.mock('socket.io-client', () => ({ io: () => fakeSocket }))

const api = vi.hoisted(() => ({
    getNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    deleteNotification: vi.fn(),
    deleteAllNotifications: vi.fn(),
}))
vi.mock('@/lib/api/notifications', () => api)
vi.mock('@/lib/api', () => ({ API_URL: 'http://api.test' }))

import { NotificationProvider, useNotificationSocket } from '../NotificationProvider'

const note = (id: string, read = false) => ({ _id: id, type: 'reply', title: `T${id}`, message: `M${id}`, read, createdAt: new Date().toISOString() })

function Probe() {
    const { notifications, unreadCount, liveArrivals, markAsRead, deleteNotification } = useNotificationSocket()
    return (
        <div>
            <span data-testid="count">{unreadCount}</span>
            <span data-testid="arrivals">{liveArrivals}</span>
            <span data-testid="ids">{notifications.map((n) => n._id).join(',')}</span>
            <span data-testid="reads">{notifications.map((n) => `${n._id}:${n.read ? 'r' : 'u'}`).join(',')}</span>
            <button onClick={() => markAsRead('1')}>read1</button>
            <button onClick={() => deleteNotification('2')}>delete2</button>
        </div>
    )
}

const renderProvider = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(<QueryClientProvider client={qc}><NotificationProvider><Probe /></NotificationProvider></QueryClientProvider>)
    return { ...view, qc }
}

beforeEach(() => {
    vi.clearAllMocks()
    api.getNotifications.mockResolvedValue({ success: true, data: [note('1'), note('2', true)], pagination: {} })
    api.getUnreadCount.mockResolvedValue({ count: 1, byType: {} })
    api.markNotificationRead.mockResolvedValue({})
    api.deleteNotification.mockResolvedValue({})
})
afterEach(() => { vi.useRealTimers() })

describe('NotificationProvider', () => {
    it('loads the recent notifications and the real unread count', async () => {
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        expect(screen.getByTestId('count')).toHaveTextContent('1')
    })

    it('counts a notification once however often it is marked read', async () => {
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
        await act(async () => { screen.getByText('read1').click() })
        expect(screen.getByTestId('count')).toHaveTextContent('0')
        await act(async () => { screen.getByText('read1').click() })
        expect(screen.getByTestId('count')).toHaveTextContent('0')
        expect(api.markNotificationRead).toHaveBeenCalledTimes(1)
    })

    it('does not touch the unread count when a read notification is deleted', async () => {
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        await act(async () => { screen.getByText('delete2').click() })
        expect(screen.getByTestId('ids')).toHaveTextContent('1')
        expect(screen.getByTestId('count')).toHaveTextContent('1')
    })

    it('puts a notification back and says so when the delete fails', async () => {
        api.deleteNotification.mockRejectedValue(new Error('no'))
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        await act(async () => { screen.getByText('delete2').click() })
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }))
    })

    it('adds a live notification once and counts it', async () => {
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        act(() => { handlers.newNotification(note('3')); handlers.newNotification(note('3')) })
        expect(screen.getByTestId('ids')).toHaveTextContent('3,1,2')
    })

    it('shows a couple of pop-ups for a burst, then one summary', async () => {
        renderProvider()
        await waitFor(() => expect(handlers.newNotification).toBeDefined())
        vi.useFakeTimers()
        act(() => { for (const id of ['a', 'b', 'c', 'd', 'e']) handlers.newNotification(note(id)) })
        expect(addToast).toHaveBeenCalledTimes(2)
        act(() => { vi.advanceTimersByTime(6100) })
        expect(addToast).toHaveBeenCalledTimes(3)
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ message: '3 more updates waiting for you.' }))
    })

    it('counts a live notification once, even if it is announced twice', async () => {
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
        act(() => { handlers.newNotification(note('3')); handlers.newNotification(note('3')) })
        expect(screen.getByTestId('count')).toHaveTextContent('2')
        expect(screen.getByTestId('arrivals')).toHaveTextContent('1')
    })
})

describe('NotificationProvider group updates', () => {
    const group = (id: string, count: number, over: Record<string, unknown> = {}) => ({
        ...note(id), type: 'like', groupKey: `like:post:${id}`, actorCount: count,
        recentActors: [{ _id: 'x', username: 'xena', avatar: null }], createdAt: new Date().toISOString(), ...over,
    })

    const key = ['notifications', 'list', 'u1', false, null]
    const page = (data: unknown[]) => ({ pages: [{ success: true, data, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1 } }], pageParams: [1] })

    it('moves the updated group to the top without counting it again while it is unread', async () => {
        api.getNotifications.mockResolvedValue({ success: true, data: [note('1'), group('2', 2)], pagination: {} })
        api.getUnreadCount.mockResolvedValue({ count: 2, byType: {} })
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        expect(screen.getByTestId('count')).toHaveTextContent('2')

        act(() => { handlers.notificationUpdated(group('2', 3, { read: false })) })
        expect(screen.getByTestId('ids')).toHaveTextContent('2,1')
        expect(screen.getByTestId('count')).toHaveTextContent('2')
    })

    it('makes a read group unread again, counting it once', async () => {
        api.getNotifications.mockResolvedValue({ success: true, data: [note('1', true), group('2', 2, { read: true })], pagination: {} })
        api.getUnreadCount.mockResolvedValue({ count: 0, byType: {} })
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))

        act(() => { handlers.notificationUpdated(group('2', 3, { read: true })) })
        expect(screen.getByTestId('ids')).toHaveTextContent('2,1')
        expect(screen.getByTestId('count')).toHaveTextContent('1')
        act(() => { handlers.notificationUpdated(group('2', 4)) })
        expect(screen.getByTestId('count')).toHaveTextContent('1')
    })

    it('asks the server for the count when it has never seen the group', async () => {
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        api.getUnreadCount.mockResolvedValue({ count: 4, byType: {} })
        act(() => { handlers.notificationUpdated(group('9', 6)) })
        expect(screen.getByTestId('ids')).toHaveTextContent('9,1,2')
        await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('4'))
    })

    it('replaces the row in the open lists and puts it first', async () => {
        const { qc } = renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        qc.setQueryData(key, page([note('1'), group('2', 2, { read: true })]))
        qc.setQueryData(['notifications', 'list', 'u1', true, null], page([note('1')]))

        act(() => { handlers.notificationUpdated(group('2', 3)) })

        const all = qc.getQueryData<ReturnType<typeof page>>(key)!.pages[0].data as Array<{ _id: string; actorCount?: number; read: boolean }>
        expect(all.map((n) => n._id)).toEqual(['2', '1'])
        expect(all[0]).toMatchObject({ actorCount: 3, read: false })
        const unread = qc.getQueryData<ReturnType<typeof page>>(['notifications', 'list', 'u1', true, null])!.pages[0].data as Array<{ _id: string }>
        expect(unread.map((n) => n._id)).toEqual(['2', '1'])
    })

    it('shows one pop-up for the update', async () => {
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        act(() => { handlers.notificationUpdated(group('2', 3)) })
        expect(addToast).toHaveBeenCalledTimes(1)
    })

    it('still lets a group be marked read and deleted', async () => {
        api.getNotifications.mockResolvedValue({ success: true, data: [group('1', 3), note('2', true)], pagination: {} })
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        await act(async () => { screen.getByText('read1').click() })
        expect(screen.getByTestId('count')).toHaveTextContent('0')
        expect(api.markNotificationRead).toHaveBeenCalledWith('1')
    })

    it('keeps an optimistic read when a socket event arrives in the same tick', async () => {
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        act(() => {
            screen.getByText('read1').click()
            handlers.newNotification(note('3'))
        })
        expect(screen.getByTestId('reads')).toHaveTextContent('3:u,1:r,2:r')
    })

    it('keeps an optimistic delete when an update arrives in the same tick', async () => {
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        act(() => {
            screen.getByText('delete2').click()
            handlers.newNotification(note('4'))
        })
        expect(screen.getByTestId('ids')).toHaveTextContent('4,1')
    })

    it('puts a failed delete back in place and keeps what arrived meanwhile', async () => {
        let fail!: (e: Error) => void
        api.deleteNotification.mockReturnValue(new Promise((_, reject) => { fail = reject }))
        renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        act(() => { screen.getByText('delete2').click() })
        act(() => { handlers.newNotification(note('5')) })
        await act(async () => { fail(new Error('no')) })
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('5,1,2'))
    })
})

describe('NotificationProvider list totals', () => {
    const page = (data: unknown[], total: number) => ({ pages: [{ success: true, data, pagination: { page: 1, limit: 20, total, totalPages: 1 } }], pageParams: [1] })
    const grp = (id: string) => ({ ...note(id), type: 'like', groupKey: `like:${id}`, actorCount: 3, createdAt: new Date().toISOString() })

    it('counts a group the list did not hold, and not one it already did', async () => {
        const { qc } = renderProvider()
        await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1,2'))
        const key = ['notifications', 'list', 'u1', false, null]
        qc.setQueryData(key, page([note('1'), grp('2')], 2))

        act(() => { handlers.notificationUpdated(grp('2')) })
        expect((qc.getQueryData(key) as ReturnType<typeof page>).pages[0].pagination.total).toBe(2)

        act(() => { handlers.notificationUpdated(grp('9')) })
        const after = qc.getQueryData(key) as ReturnType<typeof page>
        expect(after.pages[0].pagination.total).toBe(3)
        expect((after.pages[0].data as Array<{ _id: string }>).map((n) => n._id)).toEqual(['9', '2', '1'])
    })
})
