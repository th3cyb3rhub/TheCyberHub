'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Award, Copy, Printer, ShieldCheck } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useCertificate } from '@/hooks/queries/useLearningPaths';
import { formatDate, pathHref } from '@/lib/learning/display';
import type { Certificate } from '@/types/learning';
import { EmptyBlock, ErrorState, Skeleton } from './shared';
import { btnPrimary, btnSecondary, muted, pageBg } from '@/components/events/styles';
import { isNotFound } from '@/lib/learning/errors';

/** The public certificate page: what was completed, by whom, when, and that the id is real */
export function CertificateView({ id, initial }: { id: string; initial?: Certificate | null }) {
    const query = useCertificate(id, initial);
    const { addToast } = useToast();
    const cert = query.data;

    // Printing leaves the site's header and footer out
    useEffect(() => {
        document.body.dataset.printCertificate = '1';
        return () => { delete document.body.dataset.printCertificate; };
    }, []);

    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6 print:pt-0">
                {!cert ? (
                    query.isError ? (
                        isNotFound(query.error) ? (
                            <EmptyBlock icon={Award} title="Certificate not found" action={<Link href="/roadmaps" className={btnPrimary}>Browse roadmaps</Link>}>
                                No certificate has this id. Check the link or ask the person who shared it.
                            </EmptyBlock>
                        ) : <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not check this certificate" />
                    ) : (
                        <div role="status" aria-label="Checking certificate" className="space-y-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-64 w-full" /></div>
                    )
                ) : (
                    <>
                        <article className="rounded-3xl border-4 border-double border-orange-700 bg-white p-8 text-center shadow-sm dark:border-orange-500 dark:bg-neutral-900/60 sm:p-12 print:border-orange-700 print:bg-white print:text-black print:shadow-none" aria-labelledby="cert-title" data-testid="certificate">
                            <Award className="mx-auto h-12 w-12 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.25em] text-orange-800 dark:text-orange-400 print:text-orange-800">TheCyberHub</p>
                            <h1 id="cert-title" className="mt-2 text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl print:text-black">Certificate of completion</h1>
                            <p className={`mt-8 text-sm ${muted} print:text-gray-700`}>This certifies that</p>
                            <p className="mt-2 break-words text-2xl font-semibold text-gray-900 dark:text-white print:text-black" data-testid="cert-recipient">@{cert.recipient.username}</p>
                            <p className={`mt-6 text-sm ${muted} print:text-gray-700`}>completed the {cert.path.kind === 'roadmap' ? 'roadmap' : 'learning path'}</p>
                            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white print:text-black" data-testid="cert-title">{cert.path.title}</p>
                            <p className={`mt-6 text-sm ${muted} print:text-gray-700`}>on <time dateTime={cert.completedAt}>{formatDate(cert.completedAt)}</time></p>

                            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-200 pt-6 text-sm dark:border-neutral-700 print:border-gray-300">
                                <span className="inline-flex items-center gap-1.5 font-medium text-green-800 dark:text-green-400 print:text-green-800"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Valid certificate</span>
                                <span className={`${muted} print:text-gray-700`}>Certificate id <span className="font-mono text-gray-900 dark:text-gray-100 print:text-black" data-testid="cert-id">{cert.certificateId}</span></span>
                            </div>
                            {cert.selfPaced && <p className={`mt-4 text-xs ${muted} print:text-gray-700`}>This records completion of a self-paced {cert.path.kind === 'roadmap' ? 'roadmap' : 'path'}. It is not an exam or an accreditation.</p>}
                        </article>

                        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 print:hidden" data-print-hide>
                            <button type="button" className={btnPrimary} onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" /> Print or save as PDF</button>
                            <button
                                type="button"
                                className={btnSecondary}
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(window.location.href);
                                        addToast({ variant: 'success', message: 'Link copied.' });
                                    } catch {
                                        addToast({ variant: 'error', message: 'Could not copy the link.' });
                                    }
                                }}
                            ><Copy className="h-4 w-4" aria-hidden="true" /> Copy link</button>
                            <Link href={pathHref(cert.path.kind, cert.path.slug)} className={btnSecondary}>View the {cert.path.kind === 'roadmap' ? 'roadmap' : 'path'}</Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
