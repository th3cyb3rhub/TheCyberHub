'use client';

import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { ToolShell } from '@/components/tools/ToolShell';
import { CopyButton, DownloadButton, Pill } from '@/components/tools/ResultParts';
import { btnSecondary, card, focusRing, input, label as labelClass, muted, type Tone } from '@/components/tools/styles';
import { fillCallback, needsCallback, parseCallbackUrl, SSRF_CATEGORIES, SSRF_PAYLOADS, type SsrfRisk } from '@/lib/tools/ssrfPayloads';

const SLUG = 'ssrf-tester';

const RISK: Record<SsrfRisk, { label: string; tone: Tone }> = {
    low: { label: 'Low risk', tone: 'good' },
    medium: { label: 'Medium risk', tone: 'info' },
    high: { label: 'High risk', tone: 'warn' },
    critical: { label: 'Critical risk', tone: 'critical' },
};

function CallbackPanel({ callback, onChange }: { callback: string | null; onChange: (value: string | null) => void }) {
    const [draft, setDraft] = useState('');
    const [error, setError] = useState<string | null>(null);

    const apply = () => {
        const parsed = parseCallbackUrl(draft);
        if (!parsed.ok) { setError(parsed.error); return; }
        setError(null);
        onChange(parsed.value);
    };

    return (
        <section className={`${card} mb-6 p-5`} aria-labelledby="ssrf-callback" data-testid="callback-panel">
            <h2 id="ssrf-callback" className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">Bring your own callback URL</h2>
            <p className={`mb-4 text-sm ${muted}`}>
                Out-of-band payloads need an address you control that records incoming requests, such as a
                {' '}<a className="underline underline-offset-2" href="https://github.com/projectdiscovery/interactsh" target="_blank" rel="noopener noreferrer">interactsh<span className="sr-only"> (opens in a new tab)</span></a> client,
                {' '}Burp Collaborator, or your own server. Paste its address and the payloads below are filled in. This site does not run a listener, so it cannot tell you whether a payload was fetched: watch your own listener for hits.
            </p>
            {callback ? (
                <div className="flex flex-wrap items-center gap-3">
                    <code className="min-w-0 flex-1 break-all rounded-xl bg-gray-100 px-3 py-2 font-mono text-sm text-gray-900 dark:bg-neutral-950 dark:text-gray-200" data-testid="callback-value">{callback}</code>
                    <button type="button" className={btnSecondary} onClick={() => { onChange(null); setDraft(''); }}>Remove</button>
                </div>
            ) : (
                <form className="flex flex-col gap-3 sm:flex-row" noValidate onSubmit={(e) => { e.preventDefault(); apply(); }}>
                    <div className="flex-1">
                        <label htmlFor="ssrf-callback-input" className={labelClass}>Callback address</label>
                        <input
                            id="ssrf-callback-input" type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://abc123.oast.example" autoComplete="off" spellCheck={false}
                            aria-invalid={!!error} aria-describedby={error ? 'ssrf-callback-error' : undefined} className={input}
                        />
                        {error && <p id="ssrf-callback-error" role="alert" className="mt-1 text-sm text-red-800 dark:text-red-300">{error}</p>}
                    </div>
                    <button type="submit" className={`${btnSecondary} self-end`}>Use this address</button>
                </form>
            )}
        </section>
    );
}

export default function SsrfPayloadPage() {
    const [callback, setCallback] = useState<string | null>(null);
    const [category, setCategory] = useState('all');
    const [query, setQuery] = useState('');
    const [guide, setGuide] = useState(false);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return SSRF_PAYLOADS.filter((p) => (category === 'all' || p.category === category)
            && (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.payload.toLowerCase().includes(q)));
    }, [category, query]);

    const exportText = useMemo(() => rows.map((p) => `${p.name}: ${fillCallback(p.payload, callback)}`).join('\n'), [rows, callback]);

    return (
        <ToolShell slug={SLUG}>
            <CallbackPanel callback={callback} onChange={setCallback} />

            <section className={`${card} mb-6 p-5`} aria-label="Filter payloads">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                    <div className="flex-1">
                        <label htmlFor="ssrf-search" className={labelClass}>Search payloads</label>
                        <input id="ssrf-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="metadata, gopher, 169.254" className={input} autoComplete="off" />
                    </div>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
                        {SSRF_CATEGORIES.map((c) => (
                            <button
                                key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}
                                className={`rounded-full border px-3 py-1 text-sm ${focusRing} ${category === c.id ? 'border-orange-700 bg-orange-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}
                            >{c.name}</button>
                        ))}
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-neutral-800">
                    <p className={`text-sm ${muted}`} aria-live="polite" data-testid="payload-count">Showing {rows.length} of {SSRF_PAYLOADS.length} payloads</p>
                    <div className="flex flex-wrap gap-2">
                        <DownloadButton filename="ssrf-payloads.txt" content={exportText} mime="text/plain" label="Download list" />
                        <button type="button" className={btnSecondary} aria-expanded={guide} onClick={() => setGuide(!guide)}><Info className="h-4 w-4" aria-hidden="true" /> Testing guide</button>
                    </div>
                </div>
            </section>

            {guide && (
                <section className="mb-6 rounded-2xl border border-blue-300 bg-blue-50 p-5 text-sm text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100" aria-label="Testing guide">
                    <div className="grid gap-5 md:grid-cols-2">
                        <div>
                            <h2 className="mb-2 font-semibold">Steps</h2>
                            <ol className="list-inside list-decimal space-y-1">
                                <li>Get a callback address from your own listener (optional, for out-of-band payloads)</li>
                                <li>Pick a payload category and copy a payload</li>
                                <li>Send it to a parameter of an application you are allowed to test</li>
                                <li>Compare the response, its timing and any error text</li>
                                <li>For out-of-band payloads, check your listener for a request</li>
                                <li>Write down what you tried and what you saw</li>
                            </ol>
                        </div>
                        <div>
                            <h2 className="mb-2 font-semibold">Parameters worth trying</h2>
                            <ul className="space-y-1 font-mono text-xs">
                                <li>?url=, ?link=, ?src=, ?target=</li>
                                <li>?redirect=, ?next=, ?callback=</li>
                                <li>?api=, ?endpoint=, ?service=</li>
                                <li>?file=, ?path=, ?document=</li>
                                <li>?proxy=, ?gateway=, ?fetch=</li>
                            </ul>
                        </div>
                    </div>
                </section>
            )}

            {rows.length === 0 ? (
                <div className={`${card} p-8 text-center`} data-testid="no-payloads">
                    <p className="mb-3 text-base font-semibold text-gray-900 dark:text-white">No payloads match</p>
                    <button type="button" className={btnSecondary} onClick={() => { setQuery(''); setCategory('all'); }}>Clear filters</button>
                </div>
            ) : (
                <ul className="space-y-4" data-testid="payload-list">
                    {rows.map((p) => {
                        const missing = needsCallback(p.payload) && !callback;
                        const text = fillCallback(p.payload, callback);
                        const risk = RISK[p.riskLevel];
                        return (
                            <li key={p.id} className={`${card} p-5`} data-testid="payload">
                                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">{p.name}</h3>
                                        <div className="flex flex-wrap gap-1.5">
                                            <Pill tone={risk.tone}>{risk.label}</Pill>
                                            <Pill>{SSRF_CATEGORIES.find((c) => c.id === p.category)?.name ?? p.category}</Pill>
                                            {missing && <Pill tone="warn">Needs a callback URL</Pill>}
                                        </div>
                                    </div>
                                    <CopyButton text={text} label="Copy payload" />
                                </div>
                                <p className={`mb-3 text-sm ${muted}`}>{p.description}</p>
                                <pre className="mb-3 overflow-x-auto rounded-xl border border-gray-200 bg-gray-100 p-3 font-mono text-sm text-orange-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-orange-300"><code>{text}</code></pre>
                                <dl className="grid gap-2 text-sm md:grid-cols-2">
                                    <div><dt className={`inline ${muted}`}>Context: </dt><dd className="inline text-gray-900 dark:text-gray-200">{p.context}</dd></div>
                                    <div><dt className={`inline ${muted}`}>Example: </dt><dd className="inline text-gray-900 dark:text-gray-200">{p.example}</dd></div>
                                </dl>
                            </li>
                        );
                    })}
                </ul>
            )}

            <section className="mt-10 rounded-2xl border border-red-300 bg-red-50 p-5 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" aria-labelledby="ssrf-legal">
                <h2 id="ssrf-legal" className="mb-2 text-base font-semibold">Authorised testing only</h2>
                <ul className="list-inside list-disc space-y-1">
                    <li>Only test systems you own or have written permission to test.</li>
                    <li>Respect rate limits and avoid disrupting the service.</li>
                    <li>Report findings through the owner&apos;s disclosure process.</li>
                </ul>
            </section>
        </ToolShell>
    );
}
