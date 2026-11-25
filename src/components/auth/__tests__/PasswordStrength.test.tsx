import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PasswordStrength } from '../PasswordStrength'

describe('PasswordStrength', () => {
    it('renders nothing for an empty password', () => {
        const { container } = render(<PasswordStrength password="" id="s" />)
        expect(container).toBeEmptyDOMElement()
    })

    it('announces the verdict and what is missing in a polite live region', () => {
        render(<PasswordStrength password="abcdefgh" id="s" />)
        const status = screen.getByRole('status')
        expect(status).toHaveAttribute('aria-live', 'polite')
        expect(status).toHaveTextContent('Password strength: Weak. Still needed: uppercase letter, number, special character.')
    })

    it('keeps the live sentence the same while typing does not change the verdict', () => {
        const { rerender } = render(<PasswordStrength password="abcdefgh" id="s" />)
        const before = screen.getByRole('status').textContent
        rerender(<PasswordStrength password="abcdefghi" id="s" />)
        expect(screen.getByRole('status').textContent).toBe(before)
    })

    it('marks each rule in words, not only by colour', () => {
        render(<PasswordStrength password="Abcdefg1" id="s" />)
        expect(screen.getByText('Uppercase letter').parentElement).toHaveTextContent('(done)')
        expect(screen.getByText('Special character').parentElement).toHaveTextContent('(still needed)')
    })

    it('does not tell a screen reader about the decorative bar', () => {
        render(<PasswordStrength password="abc" id="s" />)
        expect(document.querySelector('[aria-hidden="true"].flex')).not.toBeNull()
    })
})
