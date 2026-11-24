'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, Sparkles, Wrench, X } from 'lucide-react';
import Footer from '@/components/Footer';
import { useToolsRegistry } from '@/hooks/queries/useTools';
import { countByFilter, filterTools, parseToolFilters, toolFilterQuery, TRUST_LABELS, type ToolFilter } from '@/lib/tools/registry';
import { ToolCard } from './ToolCard';
import { btnSecondary, card, focusRing, input, muted, pageBg } from './styles';

const chipClass = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${focusRing} ${on
        ? 'border-orange-700 bg-orange-700 text-white'
        : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`;

/** The tools index: search, category chips and the cards, with the filters kept in the address */
export function ToolsIndex() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const { tools, categories, live, isError } = useToolsRegistry();
    const initial = useMemo(() => parseToolFilters(params), [params]);
    const [q, setQ] = useState(initial.q);
    const [cat, setCat] = useState<ToolFilter>(initial.cat);
    const inputRef = useRef<HTMLInputElement>(null);

    // Keep the address in step with the filters (and the filters in step with Back and Forward)
    const current = useRef(toolFilterQuery({ q: initial.q, cat: initial.cat }));
    useEffect(() => {
        const next = toolFilterQuery({ q, cat });
        if (next === current.current) return;
        const timer = setTimeout(() => {
            current.current = next;
            router.replace(`${pathname}${next}`, { scroll: false });
        }, 250);
        return () => clearTimeout(timer);
    }, [q, cat, pathname, router]);
    useEffect(() => {
        const fromUrl = toolFilterQuery(initial);
        if (fromUrl !== current.current) {
            current.current = fromUrl;
            setQ(initial.q);
            setCat(initial.cat);
        }
    }, [initial]);

    // "/" focuses the search box (Ctrl or Cmd + K opens the site-wide search, which lists every tool)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
            if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const counts = useMemo(() => countByFilter(tools), [tools]);
    const visible = useMemo(() => filterTools(tools, { q, cat }, categories), [tools, q, cat, categories]);
    const clear = () => { setQ(''); setCat('all'); };

    return (
        <div className={pageBg}>
            <header className="border-b border-gray-200 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(249,115,22,0.12),transparent)] dark:border-neutral-900 dark:bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(249,115,22,0.10),transparent)]">
                <div className="mx-auto max-w-6xl px-4 pb-10 pt-24 sm:px-6">
                    <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-300">
                        <Wrench className="h-4 w-4 text-orange-700 dark:text-orange-400" aria-hidden="true" /> {tools.length} free tools
                    </p>
                    <h1 className="mb-3 text-4xl font-bold text-gray-900 dark:text-white sm:text-5xl">Security tools</h1>
                    <p className={`mb-6 max-w-2xl text-lg ${muted}`}>
                        Lookups, analyzers and payload references for testing and learning. Most run in your browser; lookups use our server without an account, and tools that connect to a target need a verified account.
                    </p>

                    <form role="search" className="max-w-2xl" onSubmit={(e) => e.preventDefault()}>
                        <label htmlFor="tools-search" className="sr-only">Search tools</label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                            <input
                                id="tools-search" ref={inputRef} type="search" value={q} onChange={(e) => setQ(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.preventDefault(); setQ(''); } }}
                                placeholder="Search tools... (press /)" autoComplete="off" spellCheck={false}
                                className={`${input} pl-11 pr-10`}
                                aria-controls="tools-grid"
                            />
                            {q && (
                                <button type="button" onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Clear search" className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-neutral-800 ${focusRing}`}>
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
                <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
                    <button type="button" aria-pressed={cat === 'all'} onClick={() => setCat('all')} className={chipClass(cat === 'all')} data-testid="chip-all">All <span className="opacity-80">({counts.all})</span></button>
                    <button type="button" aria-pressed={cat === 'popular'} onClick={() => setCat('popular')} className={chipClass(cat === 'popular')} data-testid="chip-popular"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Popular <span className="opacity-80">({counts.popular})</span></button>
                    {categories.map((c) => (
                        <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={chipClass(cat === c.id)} data-testid={`chip-${c.id}`}>
                            {c.name} <span className="opacity-80">({counts[c.id] ?? 0})</span>
                        </button>
                    ))}
                </div>

                <div className={`mb-4 flex flex-wrap items-center justify-between gap-2 text-sm ${muted}`}>
                    <p aria-live="polite" data-testid="tools-count">{visible.length === tools.length ? `${tools.length} tools` : `${visible.length} of ${tools.length} tools`}</p>
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span>{TRUST_LABELS.browser.label}: nothing is sent</span>
                        <span>{TRUST_LABELS.server.label}: public lookups</span>
                        <span>{TRUST_LABELS['server-login'].label}: connects to a target</span>
                    </p>
                </div>

                {isError && !live && (
                    <p role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="registry-fallback">
                        Showing the built-in list. We could not check which tools are switched on right now.
                    </p>
                )}

                {visible.length > 0 ? (
                    <div id="tools-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="tools-grid">
                        {visible.map((tool, i) => <ToolCard key={tool.slug} tool={tool} index={i} />)}
                    </div>
                ) : (
                    <div id="tools-grid" className={`${card} px-6 py-14 text-center`} data-testid="tools-empty">
                        <Search className="mx-auto mb-3 h-8 w-8 text-gray-500" aria-hidden="true" />
                        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">No tools match</h2>
                        <p className={`mb-4 text-sm ${muted}`}>Try fewer words or another category. Missing something? Tell us in the forums.</p>
                        <div className="flex flex-wrap justify-center gap-3">
                            <button type="button" className={btnSecondary} onClick={clear}>Clear filters</button>
                            <Link href="/forums" className={btnSecondary}>Suggest a tool</Link>
                        </div>
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
}
