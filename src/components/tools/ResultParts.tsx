'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Check, Clock, Copy, Download, Gauge, Loader2, RefreshCw, ShieldOff } from 'lucide-react';
import { formatWait, toolErrorInfo, type ToolErrorKind } from '@/lib/tools/errors';
import type { ToolMetaInfo } from '@/types/tools';
import { btnPrimary, btnSecondary, card, chip, codeBlock, muted, tone, type Tone } from './styles';

// ---------------------------------------------------------------------------
// Copy and export
// ---------------------------------------------------------------------------

/** Copies text and says so in words (visible and for screen readers). A refused clipboard is reported, not ignored. */
export function CopyButton({ text, label = 'Copy', className = btnSecondary }: { text: string; label?: string; className?: string }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const copy = async () => {
        try {
            if (!navigator.clipboard) throw new Error('no clipboard');
            await navigator.clipboard.writeText(text);
            setState('copied');
        } catch {
            setState('failed');
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState('idle'), 2500);
    };

    return (
        <>
            <button type="button" className={className} onClick={copy}>
                {state === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
            </button>
            <span role="status" aria-live="polite" className="sr-only">
                {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Could not copy to the clipboard' : ''}
            </span>
        </>
    );
}

/** A file the visitor can save, from a blob in the browser: nothing is uploaded */
export function DownloadButton({ filename, content, mime = 'application/json', label = 'Download' }: { filename: string; content: string; mime?: string; label?: string }) {
    const save = () => {
        const url = URL.createObjectURL(new Blob([content], { type: mime }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return (
        <button type="button" className={btnSecondary} onClick={save}>
            <Download className="h-4 w-4" aria-hidden="true" /> {label}
        </button>
    );
}

/** Copy and download for a finished result */
export function ResultActions({ data, text, filename }: { data: unknown; text?: string; filename: string }) {
    const json = useMemo(() => JSON.stringify(data, null, 2), [data]);
    return (
        <div className="flex flex-wrap gap-2" data-testid="result-actions">
            <CopyButton text={text ?? json} label={text ? 'Copy summary' : 'Copy JSON'} />
            {text && <CopyButton text={json} label="Copy JSON" />}
            <DownloadButton filename={`${filename}.json`} content={json} label="Download JSON" />
        </div>
    );
}

// ---------------------------------------------------------------------------
// How the answer was produced
// ---------------------------------------------------------------------------

/** Cached or stale, how long it took, and what is left of the visitor's quota */
export function ResultMeta({ meta, scannedAt }: { meta?: ToolMetaInfo; scannedAt?: string }) {
    if (!meta) return null;
    const quota = meta.quota;
    return (
        <div className={`flex flex-wrap items-center gap-2 text-xs ${muted}`} data-testid="result-meta">
            {meta.stale && <span className={`${chip} ${tone.warn}`} title="The data source did not answer, so an older saved copy is shown.">Stale copy: the data source is not answering</span>}
            {meta.cached && !meta.stale && <span className={`${chip} ${tone.neutral}`} title="Served from our cache, not looked up again.">Cached</span>}
            {typeof meta.tookMs === 'number' && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" /> {meta.tookMs} ms</span>}
            {scannedAt && <span>{new Date(scannedAt).toLocaleString()}</span>}
            {quota && (
                <span className="inline-flex items-center gap-1" data-testid="quota">
                    <Gauge className="h-3 w-3" aria-hidden="true" />
                    {quota.remaining} of {quota.limit} runs left this hour{quota.resetSeconds ? ` (resets in ${formatWait(quota.resetSeconds)})` : ''}
                </span>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Errors, with a countdown when the API names a wait
// ---------------------------------------------------------------------------

const ERROR_TONE: Partial<Record<ToolErrorKind, string>> = {
    rate_limited: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    disabled: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    busy: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    suspended: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    login: 'border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100',
    verify: 'border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100',
    not_found: 'border-gray-300 bg-gray-50 text-gray-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-100',
};
const DEFAULT_ERROR_TONE = 'border-red-300 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100';

/** Counts down from `seconds` to zero, once a second, and starts again when `seconds` or `resetKey` changes */
export function useCountdown(seconds: number | undefined, resetKey?: unknown): number {
    const [left, setLeft] = useState(seconds ?? 0);
    useEffect(() => {
        setLeft(seconds ?? 0);
        if (!seconds) return;
        const id = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
        return () => clearInterval(id);
    }, [seconds, resetKey]);
    return left;
}

/**
 * A failed call in words: what happened, what to do, and for a rate limit how long to wait. The retry
 * button stays disabled until the wait is over. `error` may be anything a tools call threw.
 */
export function ToolErrorPanel({ error, onRetry, retrying = false, retryLabel = 'Try again' }: {
    error: unknown;
    onRetry?: () => void;
    retrying?: boolean;
    retryLabel?: string;
}) {
    const info = useMemo(() => toolErrorInfo(error), [error]);
    const pathname = usePathname();
    const left = useCountdown(info.retryAfter, error);
    const waiting = left > 0;
    const canRetry = !!onRetry && !['login', 'verify', 'validation', 'blocked', 'opted_out', 'not_found', 'not_supported'].includes(info.kind);
    const Icon = info.kind === 'blocked' || info.kind === 'opted_out' ? ShieldOff : AlertTriangle;

    return (
        <div role="alert" className={`rounded-2xl border p-5 ${ERROR_TONE[info.kind] ?? DEFAULT_ERROR_TONE}`} data-testid="tool-error" data-kind={info.kind}>
            <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold">{info.title}</h2>
                    <p className="mt-1 text-sm">{info.retryAfter && canRetry ? info.body : info.message}</p>
                    {info.kind === 'blocked' && info.reason && <p className="mt-1 font-mono text-xs opacity-80">Reason: {info.reason}</p>}
                    {info.retryAfter && waiting && !canRetry && (
                        <p className="mt-2 text-sm font-medium" aria-live="off" data-testid="retry-countdown">Try again in {formatWait(left)}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                        {info.kind === 'login' && <Link href={`/auth?redirect=${encodeURIComponent(pathname)}`} className={btnPrimary}>Sign in</Link>}
                        {canRetry && (
                            <button type="button" className={btnSecondary} onClick={onRetry} disabled={waiting || retrying}>
                                {retrying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                                {waiting ? `${retryLabel} in ${formatWait(left)}` : retryLabel}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Small display pieces
// ---------------------------------------------------------------------------

export function ResultSkeleton({ label = 'Working', hint }: { label?: string; hint?: string }) {
    return (
        <div className={`${card} space-y-3 p-5`} role="status" aria-label={label} data-testid="result-skeleton">
            {hint && <p className="text-sm text-gray-600 dark:text-neutral-400">{hint}</p>}
            {[70, 90, 55, 80].map((w, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" style={{ width: `${w}%` }} />
            ))}
        </div>
    );
}

export function Pill({ tone: t = 'neutral', children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
    return <span className={`${chip} ${tone[t]}`} title={title}>{children}</span>;
}

/** A labelled value row for definition-style results */
export function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid gap-1 border-b border-gray-200 py-2.5 last:border-b-0 dark:border-neutral-800 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className={`text-sm ${muted}`}>{label}</dt>
            <dd className="min-w-0 break-words text-sm text-gray-900 dark:text-gray-100">{children}</dd>
        </div>
    );
}

export function Code({ children }: { children: React.ReactNode }) {
    return <pre className={codeBlock}><code>{children}</code></pre>;
}

/** The result panel: announces itself to assistive technology when its content arrives */
export function ResultPanel({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <section aria-label={label} aria-live="polite" aria-busy={false} className="mt-6" data-testid="result-panel">
            {children}
        </section>
    );
}

