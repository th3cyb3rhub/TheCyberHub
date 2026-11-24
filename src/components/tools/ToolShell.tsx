'use client';

import Link from 'next/link';
import { PauseCircle } from 'lucide-react';
import Footer from '@/components/Footer';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { useTool } from '@/hooks/queries/useTools';
import { disabledMessage } from '@/lib/tools/errors';
import { relatedLinks } from '@/lib/tools/registry';
import { ToolIcon } from './ToolIcon';
import { TrustBadge } from './TrustBadge';
import { btnSecondary, card, focusRing, muted, pageBg, tone, chip } from './styles';

/** The paused notice a tool shows when the API says it is switched off */
export function PausedNotice({ reason }: { reason: string | null }) {
    return (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="paused-notice">
            <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <div>
                <p className="font-semibold">This tool is paused</p>
                <p className="mt-0.5">{disabledMessage(reason)}</p>
            </div>
        </div>
    );
}

/** Links on to a cheatsheet, practice challenges and the learning paths */
export function RelatedLinks({ slug }: { slug: string }) {
    const { tool } = useTool(slug);
    const links = tool ? relatedLinks(tool) : [];
    if (links.length === 0) return null;
    return (
        <nav aria-label="Keep learning" className={`${card} mt-8 p-5`} data-testid="related-links">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Keep learning</h2>
            <ul className="flex flex-wrap gap-2">
                {links.map((link) => (
                    <li key={link.href}>
                        <Link href={link.href} className={`${btnSecondary} !py-1.5 text-sm`}>{link.label}</Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

/**
 * The frame of a tool page: breadcrumb, title, where it runs, the paused notice and the related
 * links. The glow behind the title is a plain gradient (no blur filter) so it is cheap to paint.
 */
export function ToolShell({ slug, children, notice }: { slug: string; children: React.ReactNode; notice?: React.ReactNode }) {
    const { tool, available, reason } = useTool(slug);
    const name = tool?.name ?? slug;
    return (
        <div className={pageBg}>
            <header className="border-b border-gray-200 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(249,115,22,0.12),transparent)] dark:border-neutral-900 dark:bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(249,115,22,0.10),transparent)]">
                <div className="mx-auto max-w-4xl px-4 pb-8 pt-24 sm:px-6">
                    <Breadcrumbs items={[{ label: 'Tools', href: '/tools' }, { label: name }]} />
                    <div className="flex items-start gap-4">
                        {tool && (
                            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-800 dark:bg-orange-500/10 dark:text-orange-400 sm:flex">
                                <ToolIcon name={tool.icon} className="h-6 w-6" />
                            </span>
                        )}
                        <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{name}</h1>
                            </div>
                            {tool && <p className={`max-w-2xl text-base ${muted}`}>{tool.description}</p>}
                            {tool && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <TrustBadge tool={tool} />
                                    {tool.requiresAcknowledgement && <span className={`${chip} ${tone.neutral}`}>Only test targets you are allowed to test</span>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
                {!available && <PausedNotice reason={reason} />}
                {notice}
                {children}
                <RelatedLinks slug={slug} />
                <p className={`mt-8 text-xs ${muted}`}>
                    <Link href="/tools" className={`rounded underline underline-offset-2 hover:text-gray-900 dark:hover:text-white ${focusRing}`}>Back to all tools</Link>
                </p>
            </main>
            <Footer />
        </div>
    );
}
