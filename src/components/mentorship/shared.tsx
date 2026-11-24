'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Loader2, RefreshCw, Star, X, type LucideIcon } from 'lucide-react';
import PostAvatar from '@/components/feed/PostAvatar';
import { mentorshipErrorMessage } from '@/lib/mentorship/errors';
import { displayName, expertiseLabel, EXPERTISE_AREAS, MENTORSHIP_STATUS_LABELS, MENTOR_STATUS_LABELS, REQUEST_STATUS_LABELS, SESSION_STATUS_LABELS } from '@/lib/mentorship/display';
import type { ExpertiseArea, MentorStatus, MentorshipStatus, RequestStatus, SessionStatus } from '@/types/mentorship';
import { btnPrimary, btnSecondary, card, chip, focusRing, input, inputError, label as labelClass, muted } from './styles';

export function Avatar({ person, size = 40 }: { person: { name?: string; username?: string | null; avatar?: string | null } | null | undefined; size?: number }) {
    return <PostAvatar name={displayName(person)} avatar={person?.avatar} size={size} />;
}

// ---------------------------------------------------------------------------
// States every data view needs
// ---------------------------------------------------------------------------

export function ErrorState({ error, onRetry, title = 'Could not load this' }: { error: unknown; onRetry?: () => void; title?: string }) {
    return (
        <div role="alert" className="flex flex-col items-center rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-500/30 dark:bg-red-500/10">
            <AlertTriangle className="mb-3 h-8 w-8 text-red-700 dark:text-red-400" aria-hidden="true" />
            <h2 className="mb-1 text-base font-semibold text-red-950 dark:text-red-100">{title}</h2>
            <p className="mb-4 max-w-md text-sm text-red-900 dark:text-red-200">{mentorshipErrorMessage(error)}</p>
            {onRetry && <button type="button" className={btnSecondary} onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</button>}
        </div>
    );
}

export function EmptyBlock({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className={`${card} flex flex-col items-center px-6 py-12 text-center`} data-testid="empty-state">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-neutral-800">
                <Icon className="h-6 w-6 text-gray-600 dark:text-gray-400" aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
            {children && <p className={`mt-1 max-w-md text-sm ${muted}`}>{children}</p>}
            {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
        </div>
    );
}

export function Skeleton({ className = '' }: { className?: string }) {
    return <div className={`animate-pulse rounded-lg bg-gray-200 motion-reduce:animate-none dark:bg-neutral-800 ${className}`} aria-hidden="true" />;
}

export function CardSkeleton({ count = 3, label = 'Loading' }: { count?: number; label?: string }) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={label}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className={`${card} p-5`}>
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
                    </div>
                    <Skeleton className="mt-4 h-3 w-full" />
                    <Skeleton className="mt-2 h-3 w-5/6" />
                    <div className="mt-4 flex gap-2"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-20 rounded-full" /></div>
                </div>
            ))}
        </div>
    );
}

export function RowSkeleton({ count = 3, label = 'Loading' }: { count?: number; label?: string }) {
    return (
        <div className="space-y-3" role="status" aria-label={label}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className={`${card} p-4`}>
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="mt-3 h-3 w-full" />
                    <Skeleton className="mt-2 h-3 w-2/3" />
                </div>
            ))}
        </div>
    );
}

export function LoadMore({ hasNext, loading, onClick, label = 'Load more' }: { hasNext: boolean; loading: boolean; onClick: () => void; label?: string }) {
    if (!hasNext) return null;
    return (
        <div className="mt-6 flex justify-center">
            <button type="button" className={btnSecondary} onClick={onClick} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {label}
            </button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export function ExpertiseChips({ areas, max, className = '' }: { areas: readonly string[]; max?: number; className?: string }) {
    const shown = max ? areas.slice(0, max) : areas;
    const rest = areas.length - shown.length;
    return (
        <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Areas of expertise">
            {shown.map((a) => (
                <li key={a} className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{expertiseLabel(a)}</li>
            ))}
            {rest > 0 && <li className={`${chip} bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300`}>+{rest}</li>}
        </ul>
    );
}

export function RatingStars({ rating, total, size = 'sm' }: { rating: number; total?: number; size?: 'sm' | 'md' }) {
    const dim = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
    const rounded = Math.round(rating);
    const unrated = total === 0;
    return (
        <span className="inline-flex items-center gap-1.5" data-testid="rating">
            <span className="inline-flex" role="img" aria-label={unrated ? 'No ratings yet' : `Rated ${rating.toFixed(1)} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} aria-hidden="true" className={`${dim} ${!unrated && n <= rounded ? 'fill-yellow-500 text-yellow-500' : 'text-gray-300 dark:text-neutral-600'}`} />
                ))}
            </span>
            <span className="text-xs text-gray-700 dark:text-gray-300">{unrated ? 'New' : `${rating.toFixed(1)}${typeof total === 'number' ? ` (${total})` : ''}`}</span>
        </span>
    );
}

/** A rating the person picks: five radio buttons, so arrows and Tab work */
export function RatingInput({ value, onChange, label = 'Rating', error }: { value: number | null; onChange: (value: number) => void; label?: string; error?: string }) {
    const name = useId();
    return (
        <fieldset>
            <legend className={labelClass}>{label}</legend>
            <div className="flex gap-1" role="radiogroup" aria-label={label}>
                {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className={`cursor-pointer rounded p-1 focus-within:ring-2 focus-within:ring-orange-500`}>
                        <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`} />
                        <Star aria-hidden="true" className={`h-7 w-7 ${value !== null && n <= value ? 'fill-yellow-500 text-yellow-500' : 'text-gray-300 dark:text-neutral-600'}`} />
                    </label>
                ))}
            </div>
            {error && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>}
        </fieldset>
    );
}

const TONES = {
    green: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300',
    amber: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
    blue: 'bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300',
    red: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300',
    gray: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300',
} as const;

const MENTOR_TONE: Record<MentorStatus, keyof typeof TONES> = { pending: 'amber', approved: 'green', rejected: 'red', suspended: 'red' };
const REQUEST_TONE: Record<RequestStatus, keyof typeof TONES> = { pending: 'amber', matched: 'blue', accepted: 'green', declined: 'red', expired: 'gray', cancelled: 'gray' };
const MENTORSHIP_TONE: Record<MentorshipStatus, keyof typeof TONES> = { active: 'green', paused: 'amber', completed: 'blue', terminated: 'red' };
const SESSION_TONE: Record<SessionStatus, keyof typeof TONES> = { scheduled: 'blue', completed: 'green', cancelled: 'gray', 'no-show': 'red' };

function Chip({ tone, text, status }: { tone: keyof typeof TONES; text: string; status: string }) {
    return <span className={`${chip} ${TONES[tone]}`} data-status={status}>{text}</span>;
}

export const MentorStatusChip = ({ status }: { status: MentorStatus }) => <Chip tone={MENTOR_TONE[status]} text={MENTOR_STATUS_LABELS[status]} status={status} />;
export const RequestStatusChip = ({ status }: { status: RequestStatus }) => <Chip tone={REQUEST_TONE[status]} text={REQUEST_STATUS_LABELS[status]} status={status} />;
export const MentorshipStatusChip = ({ status }: { status: MentorshipStatus }) => <Chip tone={MENTORSHIP_TONE[status]} text={MENTORSHIP_STATUS_LABELS[status]} status={status} />;
export const SessionStatusChip = ({ status }: { status: SessionStatus }) => <Chip tone={SESSION_TONE[status]} text={SESSION_STATUS_LABELS[status]} status={status} />;

export function CountBadge({ count, label }: { count: number; label: string }) {
    if (count <= 0) return null;
    return (
        <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-orange-700 px-1.5 text-xs font-semibold text-white" aria-label={`${count} ${label}`}>
            {count > 99 ? '99+' : count}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Form parts
// ---------------------------------------------------------------------------

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
    return (
        <div>
            <label htmlFor={id} className={labelClass}>{label}</label>
            {children}
            {hint && !error && <p id={`${id}-hint`} className={`mt-1 text-xs ${muted}`}>{hint}</p>}
            {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>}
        </div>
    );
}

export const fieldClass = (error?: string) => `${input} ${error ? inputError : ''}`;

/** Choose from the expertise list, at most `max` */
export function ExpertisePicker({ value, onChange, max, error, legend = 'Areas of expertise' }: { value: ExpertiseArea[]; onChange: (next: ExpertiseArea[]) => void; max: number; error?: string; legend?: string }) {
    const toggle = (area: ExpertiseArea) => {
        if (value.includes(area)) onChange(value.filter((a) => a !== area));
        else if (value.length < max) onChange([...value, area]);
    };
    return (
        <fieldset>
            <legend className={labelClass}>{legend} <span className={`font-normal ${muted}`}>(choose up to {max})</span></legend>
            <div className="flex flex-wrap gap-2">
                {EXPERTISE_AREAS.map((area) => {
                    const on = value.includes(area);
                    const blocked = !on && value.length >= max;
                    return (
                        <label key={area} className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-orange-500 ${on ? 'border-orange-700 bg-orange-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'} ${blocked ? 'cursor-not-allowed opacity-50' : ''}`}>
                            <input type="checkbox" className="sr-only" checked={on} disabled={blocked} onChange={() => toggle(area)} />
                            {expertiseLabel(area)}
                        </label>
                    );
                })}
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
        </fieldset>
    );
}

/** The code of conduct box shown before applying and before a first request */
export function ConductBox({ checked, onChange, error, audience }: { checked: boolean; onChange: (value: boolean) => void; error?: string; audience: 'mentor' | 'mentee' }) {
    const id = useId();
    return (
        <div className={`${card} p-4`}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Code of conduct</h3>
            <ul className={`mt-2 list-disc space-y-1 pl-5 text-sm ${muted}`}>
                <li>Keep your conversations in TheCyberHub chat. Do not ask for or share phone numbers, personal email or addresses.</li>
                <li>Be respectful and honest. Only advise on systems you are allowed to test, and never on anything illegal.</li>
                <li>{audience === 'mentor' ? 'Mentoring is voluntary guidance, not a job. You can pause or step back at any time.' : 'Your mentor volunteers their time. Be on time and tell them early when plans change.'}</li>
                <li>Anyone in a mentorship can report a person or message. Staff end mentorships that break these rules.</li>
            </ul>
            <label htmlFor={id} className="mt-3 flex items-start gap-2.5 text-sm text-gray-800 dark:text-gray-200">
                <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" aria-describedby={error ? `${id}-error` : undefined} />
                <span>I have read the code of conduct and I accept it. See also the <Link href="/community-guidelines" className="text-orange-800 underline dark:text-orange-400" target="_blank">community guidelines</Link>.</span>
            </label>
            {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

interface ModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children?: React.ReactNode;
    /** Shown inside the dialog, so a failed call keeps what was typed */
    error?: string | null;
    pending?: boolean;
    confirmLabel?: string;
    destructive?: boolean;
    confirmDisabled?: boolean;
    onConfirm?: () => void;
    size?: 'md' | 'lg';
    /** The form inside is submitted by the confirm button */
    asForm?: boolean;
}

/** A dialog: Radix traps focus, closes on Escape and returns focus to the button that opened it */
export function Modal({ open, onOpenChange, title, description, children, error, pending = false, confirmLabel, destructive = false, confirmDisabled = false, onConfirm, size = 'md', asForm = true }: ModalProps) {
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!pending && !confirmDisabled) onConfirm?.();
    };
    const body = (
        <>
            {children}
            {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400" data-testid="dialog-error">{error}</p>}
            {onConfirm && (
                <div className="mt-6 flex justify-end gap-3">
                    <Dialog.Close asChild><button type="button" className={btnSecondary} disabled={pending}>Go back</button></Dialog.Close>
                    <button type={asForm ? 'submit' : 'button'} onClick={asForm ? undefined : onConfirm} disabled={pending || confirmDisabled} className={destructive ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60 ' + focusRing : btnPrimary}>
                        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        {confirmLabel ?? 'Confirm'}
                    </button>
                </div>
            )}
        </>
    );
    return (
        <Dialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
                <Dialog.Content className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] ${size === 'lg' ? 'max-w-xl' : 'max-w-md'} -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900`}>
                    <Dialog.Close asChild>
                        <button type="button" aria-label="Close" className={`absolute right-4 top-4 rounded p-1 text-gray-500 hover:text-gray-900 dark:hover:text-white ${focusRing}`}>
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </Dialog.Close>
                    <Dialog.Title className="pr-6 text-lg font-semibold text-gray-900 dark:text-white">{title}</Dialog.Title>
                    {description
                        ? <Dialog.Description className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</Dialog.Description>
                        : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
                    <div className="mt-4">
                        {asForm ? <form onSubmit={submit} noValidate>{body}</form> : body}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/** A dialog that asks for a reason of a given length, for terminate, cancel, suspend and similar */
export function ReasonDialog({ open, onOpenChange, title, description, fieldLabel, min, max, optional = false, confirmLabel, destructive = false, pending, error, onConfirm, placeholder }: {
    open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; fieldLabel: string; min: number; max: number;
    optional?: boolean; confirmLabel: string; destructive?: boolean; pending?: boolean; error?: string | null; onConfirm: (reason: string) => void; placeholder?: string;
}) {
    const id = useId();
    const [text, setText] = useState('');
    useEffect(() => { if (!open) setText(''); }, [open]);
    const trimmed = text.trim();
    const short = !optional && trimmed.length < min;
    return (
        <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} pending={pending} error={error} destructive={destructive}
            confirmLabel={confirmLabel} confirmDisabled={short} onConfirm={() => onConfirm(trimmed)}>
            <label htmlFor={id} className={labelClass}>{fieldLabel}{optional ? ' (optional)' : ''}</label>
            <textarea id={id} rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={max} placeholder={placeholder} className={`${input} resize-none`} aria-describedby={`${id}-hint`} />
            <p id={`${id}-hint`} className={`mt-1 flex justify-between text-xs ${muted}`}>
                <span>{optional ? `Up to ${max} characters` : `At least ${min} characters`}</span>
                <span aria-hidden="true">{trimmed.length}/{max}</span>
            </p>
        </Modal>
    );
}
