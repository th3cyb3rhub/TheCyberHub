import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { formatWait, isRetryable, toolErrorInfo, toolErrorMessage } from '../errors'

const err = (status: number, code: string, message = 'server text', meta?: Record<string, unknown>) => new ApiError(message, status, code, undefined, meta)

describe('formatWait', () => {
    it('speaks in the right unit', () => {
        expect(formatWait(1)).toBe('1 second')
        expect(formatWait(42)).toBe('42 seconds')
        expect(formatWait(61)).toBe('2 minutes')
        expect(formatWait(3600)).toBe('1 hour')
        expect(formatWait(5400)).toBe('1 hour 30 minutes')
        expect(formatWait(0)).toBe('1 second')
    })
})

describe('toolErrorInfo', () => {
    it('explains a rate limit with its scope and wait', () => {
        const info = toolErrorInfo(err(429, 'TOOL_RATE_LIMITED', 'x', { scope: 'minute', retryAfter: 42, limit: 5 }))
        expect(info).toMatchObject({ kind: 'rate_limited', retryAfter: 42, scope: 'minute' })
        expect(info.message).toContain('last minute')
        expect(info.message).toContain('42 seconds')
        expect(toolErrorInfo(err(429, 'TOOL_RATE_LIMITED', 'x', { scope: 'target', retryAfter: 1800 })).message).toContain('everyone together')
        expect(toolErrorInfo(err(429, 'TOOL_RATE_LIMITED', 'x', { scope: 'concurrency', retryAfter: 5 })).message).toContain('still going')
    })

    it('explains the network and daily-share scopes', () => {
        const network = toolErrorInfo(err(429, 'TOOL_RATE_LIMITED', 'x', { scope: 'network', retryAfter: 600 }))
        expect(network).toMatchObject({ kind: 'rate_limited', scope: 'network', retryAfter: 600 })
        expect(network.message).toContain('your network')
        expect(network.message).toContain('10 minutes')
        const daily = toolErrorInfo(err(429, 'TOOL_RATE_LIMITED', 'x', { scope: 'user_daily', retryAfter: 7200 }))
        expect(daily.message).toContain('share')
        expect(daily.message).toContain('2 hours')
        expect(isRetryable(daily)).toBe(true)
    })

    it('explains a whole-run timeout', () => {
        const info = toolErrorInfo(err(504, 'TOOL_UPSTREAM_TIMEOUT'))
        expect(info.kind).toBe('timeout')
        expect(info.message).toContain('45 seconds')
        expect(isRetryable(info)).toBe(true)
    })

    it('says why a target is blocked', () => {
        const info = toolErrorInfo(err(422, 'TOOL_TARGET_BLOCKED', 'Target not allowed', { reason: 'metadata' }))
        expect(info.kind).toBe('blocked')
        expect(info.title).toBe('Target not allowed')
        expect(info.message).toContain('metadata')
        expect(info.reason).toBe('metadata')
        expect(toolErrorInfo(err(422, 'TOOL_TARGET_BLOCKED', 'x', { reason: 'loopback' })).message).toContain('loopback')
        // An unknown reason falls back to the API's own description, then to a general line
        expect(toolErrorInfo(err(422, 'TOOL_TARGET_BLOCKED', 'x', { reason: 'new_reason', description: 'Special range' })).message).toBe('Special range')
        expect(toolErrorInfo(err(422, 'TOOL_TARGET_BLOCKED', 'x')).message).toMatch(/will not contact/)
    })

    it('maps every disabled reason', () => {
        for (const reason of ['master_off', 'active_off', 'kill_switch', 'admin_off', 'daily_cap', 'counters_unavailable']) {
            const info = toolErrorInfo(err(503, 'TOOL_DISABLED', 'x', { reason }))
            expect(info.kind).toBe('disabled')
            expect(info.message.length).toBeGreaterThan(20)
            expect(info.message).not.toContain('temporarily unavailable.')
        }
        expect(toolErrorInfo(err(503, 'TOOL_DISABLED', 'x', { reason: 'daily_cap' })).message).toContain('00:00 UTC')
        expect(toolErrorInfo(err(503, 'TOOL_DISABLED', 'x')).message).toMatch(/temporarily unavailable/)
    })

    it('tells people to sign in or verify', () => {
        expect(toolErrorInfo(err(401, 'AUTH_TOKEN_INVALID')).kind).toBe('login')
        expect(toolErrorInfo(err(403, 'AUTH_EMAIL_NOT_VERIFIED')).kind).toBe('verify')
        expect(toolErrorInfo(err(401, 'SOMETHING_ELSE')).kind).toBe('login')
    })

    it('handles the remaining codes', () => {
        expect(toolErrorInfo(err(403, 'TOOL_SUSPENDED', 'x', { retryAfter: 7200 })).message).toContain('2 hours')
        expect(toolErrorInfo(err(404, 'TOOL_NOT_FOUND', 'No registration found for this domain')).message).toBe('No registration found for this domain')
        expect(toolErrorInfo(err(404, 'TOOL_NOT_FOUND', 'Nothing found')).message).toBe('No result for that input.')
        expect(toolErrorInfo(err(422, 'TOOL_TARGET_UNREACHABLE', 'x', { reason: 'connection_refused' })).message).toContain('refused')
        expect(toolErrorInfo(err(422, 'TOOL_TARGET_OPTED_OUT')).kind).toBe('opted_out')
        expect(toolErrorInfo(err(422, 'TOOL_NOT_SUPPORTED', 'This top-level domain does not publish an RDAP service')).message).toContain('RDAP')
        expect(toolErrorInfo(err(502, 'TOOL_UPSTREAM_ERROR')).message).toContain('not a result')
        expect(toolErrorInfo(err(504, 'TOOL_UPSTREAM_TIMEOUT')).kind).toBe('timeout')
        expect(toolErrorInfo(err(503, 'TOOL_UPSTREAM_BUSY', 'x', { retryAfter: 30 })).message).toContain('30 seconds')
    })

    it('uses the field messages of a validation error', () => {
        const e = new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [{ field: 'domain', message: 'domain must be a domain name' }, { message: 'second' }])
        expect(toolErrorInfo(e)).toMatchObject({ kind: 'validation', message: 'domain must be a domain name second' })
    })

    it('treats a fetch failure as the network, and anything else as unknown', () => {
        expect(toolErrorInfo(new TypeError('Failed to fetch')).kind).toBe('network')
        expect(toolErrorInfo(new Error('boom'))).toMatchObject({ kind: 'unknown', message: 'boom' })
        expect(toolErrorInfo('weird').kind).toBe('unknown')
        expect(toolErrorInfo(new ApiError('x', 500)).kind).toBe('upstream')
        expect(toolErrorInfo(new ApiError('x', 429, undefined, undefined, { retryAfter: 90 })).message).toContain('2 minutes')
    })

    it('builds one line for a toast and knows what is worth retrying', () => {
        expect(toolErrorMessage(err(429, 'TOOL_RATE_LIMITED', 'x', { scope: 'hour', retryAfter: 60 }))).toMatch(/^Rate limit reached\. /)
        expect(isRetryable(toolErrorInfo(err(429, 'TOOL_RATE_LIMITED', 'x', { scope: 'hour', retryAfter: 60 })))).toBe(true)
        expect(isRetryable(toolErrorInfo(err(422, 'TOOL_TARGET_BLOCKED', 'x', { reason: 'private' })))).toBe(false)
        expect(isRetryable(toolErrorInfo(err(503, 'TOOL_DISABLED', 'x', { reason: 'daily_cap' })))).toBe(true)
        expect(isRetryable(toolErrorInfo(err(503, 'TOOL_DISABLED', 'x', { reason: 'admin_off' })))).toBe(false)
    })
})
