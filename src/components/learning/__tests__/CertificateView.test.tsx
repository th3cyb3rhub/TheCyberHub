import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import type { Certificate } from '@/types/learning'

vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
const query = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('@/hooks/queries/useLearningPaths', () => ({ useCertificate: () => query.current }))

import { CertificateView } from '../CertificateView'

const cert = (over: Partial<Certificate> = {}): Certificate => ({
    valid: true, certificateId: 'CH-ABC123', recipient: { username: 'ada' }, path: { title: 'Web hacking', slug: 'web-hacking', kind: 'roadmap' }, completedAt: '2026-11-03T10:00:00Z', selfPaced: true, ...over,
})
const result = (data?: Certificate, extra = {}) => ({ data, isError: false, error: null, refetch: vi.fn(), ...extra })

beforeEach(() => { query.current = result(cert()) })

describe('the public certificate page', () => {
    it('shows who finished what and when, without any private detail', () => {
        render(<CertificateView id="CH-ABC123" />)
        expect(screen.getByTestId('cert-recipient')).toHaveTextContent('@ada')
        expect(screen.getByTestId('cert-title')).toHaveTextContent('Web hacking')
        expect(screen.getByTestId('cert-id')).toHaveTextContent('CH-ABC123')
        expect(screen.getByText('November 3, 2026')).toBeInTheDocument()
        expect(screen.getByText('Valid certificate')).toBeInTheDocument()
        expect(screen.getByText(/not an exam or an accreditation/)).toBeInTheDocument()
    })
    it('links to the roadmap only when the server sent a slug', () => {
        const { unmount } = render(<CertificateView id="CH-ABC123" />)
        expect(screen.getByRole('link', { name: 'View the roadmap' })).toHaveAttribute('href', '/roadmaps/web-hacking')
        unmount()
        query.current = result(cert({ path: { title: 'Retired path' } }))
        render(<CertificateView id="CH-ABC123" />)
        expect(screen.queryByRole('link', { name: /View the/ })).toBeNull()
        expect(screen.getByText(/completed the self-paced course/)).toBeInTheDocument()
    })
    it('links a learning path to its own address', () => {
        query.current = result(cert({ path: { title: 'Linux', slug: 'linux', kind: 'path' } }))
        render(<CertificateView id="CH-ABC123" />)
        expect(screen.getByRole('link', { name: 'View the path' })).toHaveAttribute('href', '/learning-paths/linux')
    })
    it('handles a certificate without a username', () => {
        query.current = result(cert({ recipient: { username: null } }))
        render(<CertificateView id="CH-ABC123" />)
        expect(screen.getByTestId('cert-recipient')).toHaveTextContent('A TheCyberHub member')
    })
    it('renders hostile text as text', () => {
        query.current = result(cert({ path: { title: '<script>alert(1)</script>' } }))
        const { container } = render(<CertificateView id="CH-ABC123" />)
        expect(container.querySelector('script')).toBeNull()
        expect(screen.getByTestId('cert-title')).toHaveTextContent('<script>alert(1)</script>')
    })
    it('says so for an unknown id and offers a retry for other errors', () => {
        query.current = result(undefined, { isError: true, error: new ApiError('nf', 404, 'CERTIFICATE_NOT_FOUND') })
        const { unmount } = render(<CertificateView id="nope" />)
        expect(screen.getByText('Certificate not found')).toBeInTheDocument()
        unmount()
        query.current = result(undefined, { isError: true, error: new ApiError('down', 503) })
        render(<CertificateView id="x" />)
        expect(screen.getByText('Could not check this certificate')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
    it('shows a loading state', () => {
        query.current = result(undefined)
        render(<CertificateView id="x" />)
        expect(screen.getByRole('status', { name: 'Checking certificate' })).toBeInTheDocument()
    })
})
