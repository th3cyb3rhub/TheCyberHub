'use client';

import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/tools/ToolShell';
import { ToolForm, useTargetParam } from '@/components/tools/ToolForm';
import { Pill, ResultActions, ResultMeta, ResultPanel, ResultSkeleton, ToolErrorPanel } from '@/components/tools/ResultParts';
import { card, focusRing, muted } from '@/components/tools/styles';
import { useDns, useTool } from '@/hooks/queries/useTools';
import { dnsSummary } from '@/lib/tools/summaries';
import { checkDnsName, isIp } from '@/lib/tools/validate';
import type { DnsRecord, DnsResult, DnsTypeResult } from '@/types/tools';

const SLUG = 'dns-lookup';
const ALL_TYPES: readonly string[] = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'CAA', 'SRV', 'PTR'];
const DEFAULT_TYPES = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'CAA'];

const sameTypes = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.includes(t));

const STATUS_TEXT: Record<DnsTypeResult['status'], { label: string; tone: 'good' | 'neutral' | 'warn' | 'bad' }> = {
    ok: { label: 'Records found', tone: 'good' },
    empty: { label: 'No records of this type', tone: 'neutral' },
    nxdomain: { label: 'Name does not exist', tone: 'warn' },
    error: { label: 'Lookup failed', tone: 'bad' },
};

const ERROR_TEXT: Record<string, string> = {
    timeout: 'The resolver did not answer in time.',
    servfail: 'The resolver reported a server failure.',
    refused: 'The resolver refused the query.',
    resolver_unreachable: 'The resolver could not be reached.',
    invalid_name: 'The name is not valid for this record type.',
    failed: 'The lookup failed.',
};

function extra(record: DnsRecord | string): string {
    if (typeof record === 'string') return '';
    const bits: string[] = [];
    if (typeof record.priority === 'number') bits.push(`priority ${record.priority}`);
    if (typeof record.ttl === 'number') bits.push(`TTL ${record.ttl}s`);
    return bits.join(', ');
}

function TypeSection({ type, entry }: { type: string; entry: DnsTypeResult }) {
    const status = STATUS_TEXT[entry.status];
    return (
        <section className={`${card} p-4`} aria-labelledby={`dns-${type}`} data-testid={`dns-${type}`} data-status={entry.status}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 id={`dns-${type}`} className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{type}</h3>
                <Pill tone={status.tone}>{status.label}</Pill>
            </div>
            {entry.status === 'ok' && (
                <ul className="space-y-1.5">
                    {entry.records.map((record, i) => {
                        const value = typeof record === 'string' ? record : record.value;
                        const more = extra(record);
                        return (
                            <li key={`${value}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-[13px] text-gray-900 dark:bg-neutral-950 dark:text-gray-200">
                                <span className="break-all">{value}</span>
                                {more && <span className={`text-xs ${muted}`}>{more}</span>}
                            </li>
                        );
                    })}
                </ul>
            )}
            {entry.status === 'error' && <p className="text-sm text-red-800 dark:text-red-300">{(entry.error && ERROR_TEXT[entry.error]) || 'The lookup failed.'} This is not the same as having no records: try again.</p>}
            {entry.status === 'nxdomain' && <p className={`text-sm ${muted}`}>The resolver says this name does not exist.</p>}
        </section>
    );
}

function Existence({ result }: { result: DnsResult }) {
    if (result.exists === true) return <Pill tone="good">Name exists</Pill>;
    if (result.exists === false) return <Pill tone="warn">Name does not exist</Pill>;
    return <Pill tone="neutral" title="Some lookups failed, so the answer is not certain.">Existence unknown</Pill>;
}

export default function DnsLookupPage() {
    const { available } = useTool(SLUG);
    const { initial, save } = useTargetParam();
    const [value, setValue] = useState('');
    const [types, setTypes] = useState<string[]>(DEFAULT_TYPES);
    const [submitted, setSubmitted] = useState<{ name: string; types: string[] } | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    // Sent only when it differs from the API's default, so the common lookup shares one cache entry
    const sentTypes = submitted && !isIp(submitted.name) && !sameTypes(submitted.types, DEFAULT_TYPES) ? submitted.types : undefined;
    const query = useDns(submitted?.name ?? null, sentTypes);

    useEffect(() => { if (initial) setValue(initial); }, [initial]);

    const typedIp = useMemo(() => isIp(value.trim().replace(/^\[|\]$/g, '')), [value]);

    const toggle = (type: string) => setTypes((current) => (current.includes(type) ? current.filter((t) => t !== type) : ALL_TYPES.filter((t) => current.includes(t) || t === type)));

    const run = () => {
        const checked = checkDnsName(value);
        if (!checked.ok) { setFormError(checked.error); return; }
        if (!isIp(checked.value) && types.length === 0) { setFormError('Pick at least one record type.'); return; }
        setFormError(null);
        save(checked.value);
        const next = { name: checked.value, types: [...types] };
        if (submitted && submitted.name === next.name && sameTypes(submitted.types, next.types)) query.refetch();
        else setSubmitted(next);
    };

    const result = query.data?.data;
    const order = result ? ALL_TYPES.filter((t) => result.results[t]).concat(Object.keys(result.results).filter((t) => ALL_TYPES.indexOf(t) < 0)) : [];

    return (
        <ToolShell slug={SLUG}>
            <ToolForm
                id="dns-name" label="Domain name or IP address" value={value} onChange={setValue} onSubmit={run}
                placeholder="example.com" buttonLabel="Look up" pending={query.isFetching} disabled={!available}
                error={formError} inputMode="url"
                hint="An IP address is looked up in reverse (PTR). The lookup uses public resolvers, so private zones are never visible."
            >
                {!typedIp && (
                    <fieldset>
                        <legend className="mb-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">Record types</legend>
                        <div className="flex flex-wrap gap-2">
                            {ALL_TYPES.filter((t) => t !== 'PTR').map((type) => {
                                const on = types.includes(type);
                                return (
                                    <button
                                        key={type} type="button" aria-pressed={on} onClick={() => toggle(type)}
                                        className={`rounded-full border px-3 py-1 font-mono text-xs ${focusRing} ${on ? 'border-orange-700 bg-orange-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}
                                    >{type}</button>
                                );
                            })}
                        </div>
                    </fieldset>
                )}
            </ToolForm>

            <div className="mt-6" data-testid="dns-output">
                {query.isFetching && <ResultSkeleton label="Looking up DNS records" />}
                {!query.isFetching && query.isError && <ToolErrorPanel error={query.error} onRetry={() => query.refetch()} />}
                {!query.isFetching && result && (
                    <ResultPanel label="DNS result">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="font-mono text-sm text-gray-900 dark:text-white">{result.name}</span>
                                <Existence result={result} />
                            </div>
                            <ResultActions data={result} text={dnsSummary(result)} filename={`dns-${result.name}`} />
                        </div>
                        <div className="mb-3"><ResultMeta meta={query.data?.meta} /></div>
                        <div className="grid gap-3 md:grid-cols-2">
                            {order.map((type) => <TypeSection key={type} type={type} entry={result.results[type]} />)}
                        </div>
                    </ResultPanel>
                )}
                {!submitted && !query.isFetching && <p className={`text-sm ${muted}`}>Enter a name to see its records. Each record type reports its own status, so a failed lookup is never shown as an empty answer.</p>}
            </div>
        </ToolShell>
    );
}
