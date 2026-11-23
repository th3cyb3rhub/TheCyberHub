import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import NotificationRow from '../NotificationRow'
import type { NotificationData } from '@/types/notifications'

const grouped = (over: Partial<NotificationData> = {}): NotificationData => ({
    _id: 'g1', type: 'like', title: 'New likes', message: 'liked your post', read: false,
    createdAt: new Date().toISOString(), link: '/feed/post/p1', groupKey: 'like:post:p1', actorCount: 5,
    actor: { name: 'Alice', username: 'alice' },
    recentActors: [
        { _id: 'a', username: 'alice', avatar: null },
        { _id: 'b', username: 'bob', avatar: null },
        { _id: 'c', username: 'cleo', avatar: null },
    ],
    ...over,
})

describe('NotificationRow', () => {
    it('reads as one sentence for a group, with stacked avatars and the right link', () => {
        render(<ul><NotificationRow notification={grouped()} onRead={vi.fn()} /></ul>)
        const link = screen.getByRole('link', { name: /alice, bob and 3 others liked your post/i })
        expect(link).toHaveAttribute('href', '/feed/post/p1')
        expect(screen.getByTestId('avatar-stack').children).toHaveLength(3)
    })

    it('marks a group read when it is opened', () => {
        const onRead = vi.fn()
        render(<ul><NotificationRow notification={grouped()} onRead={onRead} /></ul>)
        fireEvent.click(screen.getByRole('link'))
        expect(onRead).toHaveBeenCalledWith('g1')
    })

    it('keeps the plain layout for a single actor', () => {
        render(<ul><NotificationRow notification={grouped({ actorCount: 1, groupKey: null, recentActors: [] })} onRead={vi.fn()} /></ul>)
        expect(screen.getByText('@alice')).toBeInTheDocument()
        expect(screen.queryByTestId('avatar-stack')).toBeNull()
    })

    it('lets a group be deleted from the page', () => {
        const onDelete = vi.fn()
        render(<ul><NotificationRow notification={grouped()} onRead={vi.fn()} onDelete={onDelete} /></ul>)
        fireEvent.click(screen.getByRole('button', { name: 'Delete this notification' }))
        expect(onDelete).toHaveBeenCalledWith('g1')
    })
})
