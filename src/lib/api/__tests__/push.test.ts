import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchApi = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ fetchApi }))

import { getPushPublicKey, pushErrorCode, subscribePush, unsubscribePush } from '../push'

beforeEach(() => { fetchApi.mockReset() })

describe('getPushPublicKey', () => {
    it('returns the key', async () => {
        fetchApi.mockResolvedValue({ success: true, data: { publicKey: 'BKEY' } })
        expect(await getPushPublicKey()).toBe('BKEY')
        expect(fetchApi).toHaveBeenCalledWith('/api/notifications/push/public-key')
    })

    it('returns null when push is disabled, so the UI can hide', async () => {
        fetchApi.mockRejectedValue(Object.assign(new Error('off'), { code: 'PUSH_DISABLED', status: 404 }))
        expect(await getPushPublicKey()).toBeNull()
    })

    it('throws every other failure', async () => {
        fetchApi.mockRejectedValue(new Error('boom'))
        await expect(getPushPublicKey()).rejects.toThrow('boom')
    })
})

describe('subscribe and unsubscribe', () => {
    it('posts only the endpoint and keys', async () => {
        fetchApi.mockResolvedValue({ data: { id: 's1', endpoint: 'e', createdAt: 'now' } })
        await subscribePush({ endpoint: 'e', keys: { p256dh: 'p', auth: 'a' }, extra: 1 } as never)
        const [path, init] = fetchApi.mock.calls[0]
        expect(path).toBe('/api/notifications/push/subscribe')
        expect(init.method).toBe('POST')
        expect(JSON.parse(init.body)).toEqual({ endpoint: 'e', keys: { p256dh: 'p', auth: 'a' } })
    })

    it('deletes by endpoint', async () => {
        fetchApi.mockResolvedValue({ data: { removed: 1 } })
        expect(await unsubscribePush('e')).toBe(true)
        const [, init] = fetchApi.mock.calls[0]
        expect(init.method).toBe('DELETE')
        expect(JSON.parse(init.body)).toEqual({ endpoint: 'e' })
    })
})

describe('unsubscribePush with a token', () => {
    it('sends it explicitly, for sign-out', async () => {
        fetchApi.mockResolvedValue({ data: { removed: 1 } })
        await unsubscribePush('e', 'tok')
        expect(fetchApi.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok' })
    })
})

describe('pushErrorCode', () => {
    it('reads a code when there is one', () => {
        expect(pushErrorCode(Object.assign(new Error('x'), { code: 'PUSH_LIMIT_REACHED' }))).toBe('PUSH_LIMIT_REACHED')
        expect(pushErrorCode(new Error('x'))).toBeUndefined()
        expect(pushErrorCode(null)).toBeUndefined()
    })
})
