import { describe, expect, it } from 'vitest'
import { toolMetadata } from '../metadata'
import { FALLBACK_TOOLS } from '../registry'

describe('toolMetadata', () => {
    it('uses the registry name and description for every tool', () => {
        for (const tool of FALLBACK_TOOLS) {
            const meta = toolMetadata(tool.slug)
            expect(meta.title).toBe(`${tool.name} | TheCyberHub`)
            expect(meta.description).toBe(tool.description)
        }
    })

    it('does not claim scanning or geolocation that is not provided', () => {
        const text = FALLBACK_TOOLS.map((t) => `${toolMetadata(t.slug).title} ${toolMetadata(t.slug).description}`).join(' ').toLowerCase()
        expect(text).not.toMatch(/geolocation|hash crack|scan target hosts/)
    })

    it('falls back to a plain title for an unknown slug', () => {
        expect(toolMetadata('nope').title).toBe('Security Tools | TheCyberHub')
    })
})
