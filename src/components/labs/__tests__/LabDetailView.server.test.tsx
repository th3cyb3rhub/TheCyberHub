// @vitest-environment node
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import { makeLab } from '@/lib/labs/__tests__/fixtures'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

import { LabDetailView } from '../LabDetailView'

describe('LabDetailView rendered on the server', () => {
    it('renders the brief from the server copy without throwing, instructions text included', () => {
        expect(typeof window).toBe('undefined')
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const lab = makeLab({ viewer: null, instructions: '## Goal\n\nFind the hidden flag on the login page.\n\n```sql\n\' OR 1=1 --\n```' })
        const html = renderToString(
            <QueryClientProvider client={client}><LabDetailView slug={lab.slug} initialLab={lab} /></QueryClientProvider>
        )
        expect(html).toContain('SQL Injection Basics')
        expect(html).toContain('Find the hidden flag on the login page.')
        expect(html).toContain('Goal')
        expect(html).toContain('>OR<')
        expect(html).toContain('Sign in to take this lab')
    })
})
