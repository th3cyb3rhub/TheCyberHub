'use client';

import { useState } from 'react';
import { Check, Copy, Download, ExternalLink, FileText, ShieldAlert, Target } from 'lucide-react';
import { btnPrimary, cardPad, focusRing, muted } from '@/components/events/styles';
import { formatBytes, hostOf, LINK_REL, safeHref, shortDigest } from '@/lib/labs/display';
import type { LabFile } from '@/types/lab';

/** The shared target of the lab: one public link, opened in a new tab */
export function LabTarget({ url }: { url: string | null }) {
    const href = safeHref(url);
    return (
        <section aria-labelledby="lab-target" className={cardPad}>
            <h2 id="lab-target" className="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
                <Target className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Target
            </h2>
            {href ? (
                <>
                    <p className={`mb-3 text-sm ${muted}`}>
                        This lab runs on a shared, public target. It opens in a new tab on <strong className="break-all text-gray-900 dark:text-white">{hostOf(href)}</strong>, which TheCyberHub does not host or control.
                    </p>
                    <a href={href} target="_blank" rel={LINK_REL} className={btnPrimary} data-testid="lab-target-link" aria-label={`Open the target in a new tab (${hostOf(href)})`}>
                        <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open the target in a new tab
                    </a>
                </>
            ) : (
                <p className={`text-sm ${muted}`}>This lab has no target to open. Work from the instructions and the files.</p>
            )}
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100" data-testid="target-note">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Use only this target. Scanning or attacking any other system, including this site, is not part of the exercise and may be illegal.</span>
            </p>
        </section>
    );
}

function CopyDigest({ digest }: { digest: string }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(digest);
            setState('copied');
        } catch {
            setState('failed');
        }
        window.setTimeout(() => setState('idle'), 2500);
    };
    return (
        <span className="inline-flex items-center gap-1.5">
            <code className="break-all rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-800 dark:bg-neutral-800 dark:text-gray-200" title={digest}>
                <span className="sm:hidden">{shortDigest(digest)}</span>
                <span className="hidden sm:inline">{digest}</span>
            </code>
            <button type="button" onClick={() => void copy()} className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-gray-300 dark:hover:bg-neutral-800 ${focusRing}`}>
                {state === 'copied' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className="sr-only">{state === 'copied' ? 'SHA-256 copied' : state === 'failed' ? 'Could not copy' : 'Copy SHA-256'}</span>
            </button>
            <span className="sr-only" role="status">{state === 'copied' ? 'Copied to the clipboard' : state === 'failed' ? 'Could not copy the checksum' : ''}</span>
        </span>
    );
}

/** Downloads for the lab. Links are public http(s) only; the checksum lets a member check the file. */
export function LabFiles({ files }: { files: LabFile[] }) {
    if (files.length === 0) return null;
    return (
        <section aria-labelledby="lab-files" className={cardPad}>
            <h2 id="lab-files" className="mb-1 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
                <FileText className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Files
            </h2>
            <p className={`mb-4 text-sm ${muted}`}>Files are hosted elsewhere and open in a new tab. Check the SHA-256 after you download if you want to be sure it is the file the author listed.</p>
            <ul className="space-y-3">
                {files.map((file, i) => {
                    const href = safeHref(file.url);
                    const size = formatBytes(file.sizeBytes);
                    return (
                        <li key={`${i}-${file.url}`} className="rounded-xl border border-gray-200 p-3 dark:border-neutral-800" data-testid="lab-file">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="min-w-0 break-all text-sm font-medium text-gray-900 dark:text-white">
                                    {file.name}{size && <span className={`ml-2 font-normal ${muted}`}>{size}</span>}
                                </p>
                                {href ? (
                                    <a href={href} target="_blank" rel={LINK_REL} aria-label={`Download ${file.name}`} className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:text-gray-100 dark:hover:bg-neutral-800 ${focusRing}`}>
                                        <Download className="h-4 w-4" aria-hidden="true" /> Download
                                    </a>
                                ) : (
                                    <span className={`text-xs ${muted}`}>Link unavailable</span>
                                )}
                            </div>
                            {file.sha256 && (
                                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700 dark:text-gray-300">
                                    <span className="font-medium">SHA-256</span> <CopyDigest digest={file.sha256} />
                                </p>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
