import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CrMarkdown } from '../CrMarkdown'

describe('CrMarkdown', () => {
    it('shows a payload in the text as text, never as markup', () => {
        render(<CrMarkdown content={'The input <img src=x onerror="window.__cr=1"> and <script>window.__cr=2</script> reach the page.'} />)
        const box = screen.getByTestId('cr-markdown')
        expect(box.querySelector('img')).toBeNull()
        expect(box.querySelector('script')).toBeNull()
        expect(box.textContent).toContain('<img src=x onerror="window.__cr=1">')
        expect((window as unknown as { __cr?: number }).__cr).toBeUndefined()
    })

    it('renders emphasis and inline code', () => {
        render(<CrMarkdown content={'Use **bound parameters** and `execute(q, args)`.'} />)
        const box = screen.getByTestId('cr-markdown')
        expect(box.querySelector('strong')).toHaveTextContent('bound parameters')
        expect(box.querySelector('code')).toHaveTextContent('execute(q, args)')
    })

    it('does not follow a javascript link', () => {
        render(<CrMarkdown content="[click](javascript:alert(1))" />)
        const link = screen.getByTestId('cr-markdown').querySelector('a')
        expect(link?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
    })

    it('shows fenced code as text', () => {
        render(<CrMarkdown content={'Look:\n\n```html\n<script>alert(1)</script>\n```'} />)
        const box = screen.getByTestId('cr-markdown')
        expect(box.querySelector('script')).toBeNull()
        expect(box.textContent).toContain('<script>alert(1)</script>')
    })
})
