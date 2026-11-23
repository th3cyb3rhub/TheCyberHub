import { describe, it, expect } from 'vitest'
import { describeGroup, groupAvatars, isGrouped, joinNames } from '../notificationGroups'
import type { NotificationData } from '@/types/notifications'

const actor = (name: string) => ({ _id: `id-${name}`, username: name, avatar: null })

const note = (over: Partial<NotificationData> = {}): NotificationData => ({
    _id: 'n1', type: 'like', title: 'New like', message: 'liked your post', read: false,
    createdAt: '2026-11-20T10:00:00.000Z', ...over,
})

describe('joinNames', () => {
    it('handles every count', () => {
        expect(joinNames([], 1)).toBe('Someone')
        expect(joinNames([], 4)).toBe('4 people')
        expect(joinNames(['Alice'], 1)).toBe('Alice')
        expect(joinNames(['Alice', 'Bob'], 2)).toBe('Alice and Bob')
        expect(joinNames(['Alice', 'Bob', 'Cleo'], 3)).toBe('Alice, Bob and 1 other')
        expect(joinNames(['Alice', 'Bob', 'Cleo'], 5)).toBe('Alice, Bob and 3 others')
        expect(joinNames(['Alice'], 5)).toBe('Alice and 4 others')
    })
})

describe('describeGroup', () => {
    it('is null for a notification that is not grouped', () => {
        expect(describeGroup(note())).toBeNull()
        expect(describeGroup(note({ actorCount: 1, recentActors: [actor('Alice')] }))).toBeNull()
        expect(isGrouped(note({ actorCount: 1 }))).toBe(false)
    })

    it('is null for a type that is never grouped, even with a count', () => {
        expect(describeGroup(note({ type: 'follow', actorCount: 3, recentActors: [actor('Alice')] }))).toBeNull()
    })

    it('names two people', () => {
        const g = describeGroup(note({ actorCount: 2, recentActors: [actor('Alice'), actor('Bob')] }))
        expect(g?.sentence).toBe('Alice and Bob liked your post')
        expect(g?.lead).toBe('Alice and Bob')
        expect(g?.tail).toBe('liked your post')
    })

    it('says "1 other" in the singular and "others" in the plural', () => {
        const three = describeGroup(note({ actorCount: 3, recentActors: [actor('Alice'), actor('Bob'), actor('Cleo')] }))
        expect(three?.sentence).toBe('Alice, Bob and 1 other liked your post')
        const five = describeGroup(note({ actorCount: 5, recentActors: [actor('Alice'), actor('Bob'), actor('Cleo')] }))
        expect(five?.sentence).toBe('Alice, Bob and 3 others liked your post')
    })

    it('uses the verb of the notification type', () => {
        const people = [actor('Alice'), actor('Bob')]
        expect(describeGroup(note({ type: 'reshare', actorCount: 2, recentActors: people }))?.sentence).toBe('Alice and Bob reshared your post')
        expect(describeGroup(note({ type: 'comment', actorCount: 2, recentActors: people }))?.sentence).toBe('Alice and Bob commented on your post')
    })

    it('falls back to the latest actor when no recent actors came with it', () => {
        const g = describeGroup(note({ actorCount: 4, actor: { name: 'Dee', username: 'dee' } }))
        expect(g?.sentence).toBe('dee and 3 others liked your post')
        expect(describeGroup(note({ actorCount: 4 }))?.sentence).toBe('4 people liked your post')
    })
})

describe('groupAvatars', () => {
    it('shows at most three, newest first', () => {
        const people = ['a', 'b', 'c', 'd'].map(actor)
        expect(groupAvatars(note({ actorCount: 4, recentActors: people })).map((a) => a.username)).toEqual(['a', 'b', 'c'])
        expect(groupAvatars(note())).toEqual([])
    })
})
