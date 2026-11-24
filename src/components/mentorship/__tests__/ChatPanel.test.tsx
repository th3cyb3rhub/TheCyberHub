import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMentorship, makeMessage, viewer } from '@/lib/mentorship/__tests__/fixtures'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: 'user' }, loading: false }) }))

const messages = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const send = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const sendFile = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false }))
const report = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, error: null }))
const discard = vi.hoisted(() => vi.fn())
const outbox = vi.hoisted(() => ({ current: [] as unknown[] }))
vi.mock('@/hooks/queries/useMentorship', async () => {
    const actual = await vi.importActual<typeof import('@/hooks/queries/useMentorship')>('@/hooks/queries/useMentorship')
    return {
        ...actual,
        useMessages: () => messages.current,
        useSendMessage: () => send,
        useSendFile: () => sendFile,
        useDiscardMessage: () => discard,
        useOutbox: () => outbox.current,
        useMarkRead: vi.fn(),
        useReport: () => report,
    }
})

import { ChatPanel, MessageBubble } from '../ChatPanel'

const page = (data: unknown[], over: Record<string, unknown> = {}) => ({
    isLoading: false, isError: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
    data: { pages: [{ data, pagination: { limit: 30, hasMore: false, nextBefore: null } }], pageParams: [undefined] }, ...over,
})

beforeEach(() => {
    vi.clearAllMocks()
    messages.current = page([makeMessage()])
    outbox.current = []
})

describe('MessageBubble', () => {
    it('renders text as text, never as markup', () => {
        const { container } = render(<ul><MessageBubble message={makeMessage({ content: '<img src=x onerror=alert(1)> <b>hi</b>' })} mine={false} zone="UTC" /></ul>)
        expect(container.querySelector('img')).toBeNull()
        expect(container.querySelector('b')).toBeNull()
        expect(screen.getByText('<img src=x onerror=alert(1)> <b>hi</b>')).toBeInTheDocument()
    })

    it('shows code without its fence, labelled with the language', () => {
        render(<ul><MessageBubble message={makeMessage({ contentType: 'code', codeLanguage: 'python', content: '```python\nprint("<b>x</b>")\n```' })} mine zone="UTC" /></ul>)
        const block = screen.getByTestId('code-message')
        expect(block.querySelector('code')?.textContent).toBe('print("<b>x</b>")')
        expect(block.querySelector('b')).toBeNull()
        expect(within(block).getByText(/python/i)).toBeInTheDocument()
    })

    it('replaces a message a moderator hid', () => {
        render(<ul><MessageBubble message={makeMessage({ hidden: true, content: null })} mine={false} zone="UTC" /></ul>)
        expect(screen.getByText('This message was hidden by a moderator.')).toBeInTheDocument()
    })

    it('opens an attachment in a new tab with a safe rel', () => {
        render(<ul><MessageBubble message={makeMessage({ contentType: 'file', content: 'notes.pdf', attachment: { filename: 'notes.pdf', url: 'https://cdn.example.org/n.pdf', size: 2048, mimeType: 'application/pdf' } })} mine={false} zone="UTC" /></ul>)
        const link = screen.getByRole('link', { name: /notes\.pdf/ })
        expect(link).toHaveAttribute('target', '_blank')
        expect(link.getAttribute('rel')).toContain('noopener')
    })

    it('does not link an attachment that is not https', () => {
        const { container } = render(<ul><MessageBubble message={makeMessage({ contentType: 'file', content: 'x.txt', attachment: { filename: 'x.txt', url: 'javascript:alert(1)', size: 10, mimeType: 'text/plain' } })} mine={false} zone="UTC" /></ul>)
        expect(container.querySelector('a')).toBeNull()
        expect(screen.getByTestId('attachment-unavailable')).toHaveTextContent('x.txt')
    })

    it('offers retry and remove on a failed message', () => {
        const onRetry = vi.fn(); const onDiscard = vi.fn()
        render(<ul><MessageBubble message={makeMessage({ pending: 'failed' })} mine zone="UTC" onRetry={onRetry} onDiscard={onDiscard} /></ul>)
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
        expect(onRetry).toHaveBeenCalled()
        expect(onDiscard).toHaveBeenCalled()
    })

    it('shows read receipts only on my own messages', () => {
        const { rerender } = render(<ul><MessageBubble message={makeMessage({ isRead: true })} mine zone="UTC" /></ul>)
        expect(screen.getByText('Read')).toBeInTheDocument()
        rerender(<ul><MessageBubble message={makeMessage({ isRead: true })} mine={false} zone="UTC" /></ul>)
        expect(screen.queryByText('Read')).toBeNull()
    })
})

describe('ChatPanel', () => {
    it('shows a loading state, then the messages', () => {
        messages.current = page([], { isLoading: true, data: undefined })
        const { rerender } = render(<ChatPanel mentorship={makeMentorship()} active />)
        expect(screen.getByRole('status', { name: 'Loading messages' })).toBeInTheDocument()
        messages.current = page([makeMessage({ content: 'Welcome aboard' })])
        rerender(<ChatPanel mentorship={makeMentorship()} active />)
        expect(screen.getByText('Welcome aboard')).toBeInTheDocument()
    })

    it('shows an empty state', () => {
        messages.current = page([])
        render(<ChatPanel mentorship={makeMentorship()} active />)
        expect(screen.getByTestId('no-messages')).toBeInTheDocument()
    })

    it('shows the API error with a retry', () => {
        const refetch = vi.fn()
        messages.current = page([], { isError: true, error: new Error('nope'), data: undefined, refetch })
        render(<ChatPanel mentorship={makeMentorship()} active />)
        fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }))
        expect(refetch).toHaveBeenCalled()
    })

    it('loads older messages on request', () => {
        const fetchNextPage = vi.fn()
        messages.current = page([makeMessage()], { hasNextPage: true, fetchNextPage })
        render(<ChatPanel mentorship={makeMentorship()} active />)
        fireEvent.click(screen.getByRole('button', { name: /Load older messages/ }))
        expect(fetchNextPage).toHaveBeenCalled()
    })

    it('sends text on Enter and keeps Shift+Enter for a new line', () => {
        render(<ChatPanel mentorship={makeMentorship()} active />)
        const box = screen.getByLabelText('Write a message')
        fireEvent.change(box, { target: { value: '  Thanks!  ' } })
        fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
        expect(send.mutate).not.toHaveBeenCalled()
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(send.mutate).toHaveBeenCalledWith({ content: 'Thanks!', contentType: 'text', codeLanguage: undefined })
    })

    it('sends code with its language and needs Ctrl+Enter', () => {
        render(<ChatPanel mentorship={makeMentorship()} active />)
        fireEvent.click(screen.getByLabelText('Code'))
        fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'python' } })
        const box = screen.getByLabelText('Write a message')
        fireEvent.change(box, { target: { value: 'print(1)\n' } })
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(send.mutate).not.toHaveBeenCalled()
        fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
        expect(send.mutate).toHaveBeenCalledWith({ content: 'print(1)', contentType: 'code', codeLanguage: 'python' })
    })

    it('refuses code that contains three backticks, and says why', () => {
        render(<ChatPanel mentorship={makeMentorship()} active />)
        fireEvent.click(screen.getByLabelText('Code'))
        const box = screen.getByLabelText('Write a message')
        fireEvent.change(box, { target: { value: 'echo "```"' } })
        expect(screen.getByRole('alert')).toHaveTextContent(/three backticks/)
        fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
        fireEvent.click(screen.getByLabelText('Send message'))
        expect(send.mutate).not.toHaveBeenCalled()
        // The text stays in the box
        expect(box).toHaveValue('echo "```"')
        // Plain text may contain backticks
        fireEvent.click(screen.getByLabelText('Text'))
        expect(screen.getByRole('alert')).not.toHaveTextContent(/three backticks/)
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(send.mutate).toHaveBeenCalled()
    })

    it('suggests code mode when plain text contains tags', () => {
        render(<ChatPanel mentorship={makeMentorship()} active />)
        expect(screen.queryByTestId('markup-hint')).toBeNull()
        fireEvent.change(screen.getByLabelText('Write a message'), { target: { value: 'try <script>alert(1)</script>' } })
        fireEvent.click(screen.getByRole('button', { name: 'Send it as code' }))
        expect(screen.queryByTestId('markup-hint')).toBeNull()
        expect(screen.getByLabelText('Language')).toBeInTheDocument()
    })

    it('keeps messages that are still sending or failed in the list after the pages are refreshed', () => {
        outbox.current = [makeMessage({ _id: 'pending-1', sender: { _id: 'me', username: 'grace' }, content: 'Still here', pending: 'failed' })]
        render(<ChatPanel mentorship={makeMentorship()} active />)
        expect(screen.getByText('Still here')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    it('rejects a file that is too large before uploading', () => {
        render(<ChatPanel mentorship={makeMentorship()} active />)
        const big = new File(['x'], 'big.pdf', { type: 'application/pdf' })
        Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
        fireEvent.change(screen.getByTestId('file-input'), { target: { files: [big] } })
        expect(sendFile.mutate).not.toHaveBeenCalled()
        expect(screen.getByRole('alert')).toHaveTextContent(/5 MB/)
    })

    it('uploads an allowed file', () => {
        render(<ChatPanel mentorship={makeMentorship()} active />)
        const ok = new File(['x'], 'a.png', { type: 'image/png' })
        fireEvent.change(screen.getByTestId('file-input'), { target: { files: [ok] } })
        expect(sendFile.mutate).toHaveBeenCalledWith({ file: ok })
    })

    it('turns the composer off when the viewer cannot message', () => {
        render(<ChatPanel mentorship={makeMentorship({ status: 'paused', viewer: viewer({ canMessage: false }) })} active />)
        expect(screen.getByTestId('chat-disabled')).toHaveTextContent(/paused/)
        expect(screen.queryByLabelText('Write a message')).toBeNull()
    })

    it('reports a message from the other person', () => {
        render(<ChatPanel mentorship={makeMentorship()} active />)
        fireEvent.click(screen.getByRole('button', { name: /Report/ }))
        expect(screen.getByRole('dialog', { name: /Report this message/ })).toBeInTheDocument()
    })
})
