import React from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** Render with a fresh query client that never retries, so a failing call shows at once */
export function renderWithClient(ui: React.ReactElement, client?: QueryClient) {
    const qc = client ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
    const wrap = (node: React.ReactElement) => <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    const view = render(wrap(ui))
    return { ...view, qc, rerender: (next: React.ReactElement) => view.rerender(wrap(next)) }
}
