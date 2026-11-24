import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'

/** Renders with a fresh query client that never retries and never keeps old answers */
export function renderWithQuery(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

export const apiError = (status: number, code: string, message = 'server text', meta?: Record<string, unknown>) => new ApiError(message, status, code, undefined, meta)

export const meta = (over: Record<string, unknown> = {}) => ({ cached: false, ...over })
