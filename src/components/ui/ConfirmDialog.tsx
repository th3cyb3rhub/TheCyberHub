'use client'
/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useCallback, useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
    open: boolean
    onConfirm: () => void
    onCancel: () => void
    title?: string
    description?: string
    confirmText?: string
    cancelText?: string
    variant?: 'danger' | 'warning' | 'info'
}

export function ConfirmDialog({
    open,
    onConfirm,
    onCancel,
    title = 'Are you sure?',
    description = 'This action cannot be undone.',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
}: ConfirmDialogProps) {
    const panelRef = useRef<HTMLDivElement>(null)
    const cancelRef = useRef<HTMLButtonElement>(null)
    const onCancelRef = useRef(onCancel)
    onCancelRef.current = onCancel

    // Keyboard: start on the safe button, keep Tab inside the dialog, Escape cancels, focus goes back on close
    useEffect(() => {
        if (!open) return
        const previous = document.activeElement as HTMLElement | null
        cancelRef.current?.focus()
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                onCancelRef.current()
                return
            }
            if (e.key !== 'Tab' || !panelRef.current) return
            const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            if (items.length === 0) return
            const first = items[0]
            const last = items[items.length - 1]
            const active = document.activeElement
            if (e.shiftKey && (active === first || !panelRef.current.contains(active))) { e.preventDefault(); last.focus() }
            else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) { e.preventDefault(); first.focus() }
        }
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            previous?.focus?.()
        }
    }, [open])

    if (!open) return null

    // White text on these needs at least 4.5:1, so the warning colour is a dark amber
    const variantStyles = {
        danger: 'bg-red-600 hover:bg-red-700',
        warning: 'bg-amber-700 hover:bg-amber-800',
        info: 'bg-blue-600 hover:bg-blue-700',
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
            <div ref={panelRef} className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 p-2 bg-red-500/10 rounded-full">
                        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                        <h3 id="confirm-title" className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button ref={cancelRef} onClick={onCancel} className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
                        {cancelText}
                    </button>
                    <button onClick={onConfirm} className={`px-4 py-2 text-sm rounded-lg text-white transition-colors ${variantStyles[variant]}`}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    )
}

// Hook for easy usage
export function useConfirmDialog() {
    const [state, setState] = useState<{ open: boolean; resolve: ((value: boolean) => void) | null }>({
        open: false,
        resolve: null,
    })

    const confirm = useCallback(() => {
        return new Promise<boolean>((resolve) => {
            setState({ open: true, resolve })
        })
    }, [])

    const handleConfirm = useCallback(() => {
        state.resolve?.(true)
        setState({ open: false, resolve: null })
    }, [state.resolve])

    const handleCancel = useCallback(() => {
        state.resolve?.(false)
        setState({ open: false, resolve: null })
    }, [state.resolve])

    return { isOpen: state.open, confirm, onConfirm: handleConfirm, onCancel: handleCancel }
}
