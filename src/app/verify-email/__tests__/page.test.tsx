import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
    useSearchParams: () => { throw new Promise(() => {}) },
}))
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ verifyEmail: vi.fn(), user: null, requestVerification: vi.fn() }),
}))

import VerifyEmailPage from '../page'

describe('/verify-email before the address is read', () => {
    it('has its frame and the verifying heading in the HTML, the same text the content starts with', () => {
        const html = renderToString(<VerifyEmailPage />)
        expect(html).toContain('TheCyberHub')
        expect(html).toContain('href="/"')
        expect(html.match(/<h1/g)).toHaveLength(1)
        expect(html).toContain('Verifying your email...')
    })
})
