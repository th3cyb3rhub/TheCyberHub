import { renderToString } from 'react-dom/server'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useHasStoredToken } from '../useHasStoredToken'

function Probe() {
    return <p>{useHasStoredToken() ? 'token' : 'no token'}</p>
}

afterEach(() => window.localStorage.removeItem('token'))

describe('useHasStoredToken', () => {
    it('is false on the server, whatever the browser would hold', () => {
        window.localStorage.setItem('token', 't')
        expect(renderToString(<Probe />)).toContain('no token')
    })

    it('is true in a browser that holds a token, and false without one', () => {
        render(<Probe />)
        expect(screen.getByText('no token')).toBeInTheDocument()
    })

    it('reads a token that is already stored', () => {
        window.localStorage.setItem('token', 't')
        render(<Probe />)
        expect(screen.getByText('token')).toBeInTheDocument()
    })

    it('follows a sign-in or sign-out in another tab', () => {
        render(<Probe />)
        act(() => {
            window.localStorage.setItem('token', 't')
            window.dispatchEvent(new StorageEvent('storage', { key: 'token' }))
        })
        expect(screen.getByText('token')).toBeInTheDocument()
        act(() => {
            window.localStorage.removeItem('token')
            window.dispatchEvent(new StorageEvent('storage', { key: 'token' }))
        })
        expect(screen.getByText('no token')).toBeInTheDocument()
    })
})
