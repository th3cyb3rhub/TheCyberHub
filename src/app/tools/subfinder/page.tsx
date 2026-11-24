'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/tools/ToolShell';
import { ToolForm, useTargetParam } from '@/components/tools/ToolForm';
import { AccessNotice, AckCheckbox, useToolAccess } from '@/components/tools/ToolAccess';
import { CopyButton, DownloadButton, Pill, ResultActions, ResultMeta, ResultPanel, ResultSkeleton, ToolErrorPanel } from '@/components/tools/ResultParts';
import { btnSecondary, card, input, label as labelClass, muted } from '@/components/tools/styles';
import { useSubdomains, useTool } from '@/hooks/queries/useTools';
import { subdomainsSummary } from '@/lib/tools/summaries';
import { checkDomain } from '@/lib/tools/validate';
import type { SubdomainsResult } from '@/types/tools';

const SLUG = 'subfinder';
const PAGE = 200;

function Result({ data }: { data: SubdomainsResult }) {
    const [filter, setFilter] = useState('');
    const [showAll, setShowAll] = useState(false);
    const matches = useMemo(() => {
        const f = filter.trim().toLowerCase();
        return f ? data.subdomains.filter((s) => s.includes(f)) : data.subdomains;
    }, [data.subdomains, filter]);
    const shown = showAll ? matches : matches.slice(0, PAGE);
    const text = subdomainsSummary(data.domain, data.subdomains);

    return (
        <div className={`${card} p-5`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-white" data-testid="subdomain-count">{data.count.toLocaleString()} name{data.count === 1 ? '' : 's'} for {data.domain}</span>
                {data.truncated && <Pill tone="warn" title="More names exist than the tool returns.">Showing the first {data.count.toLocaleString()} of {data.total.toLocaleString()}</Pill>}
            </div>
            <p className={`mb-3 text-xs ${muted}`}>{data.note}</p>

            {data.subdomains.length === 0 ? (
                <p className={`text-sm ${muted}`} data-testid="subdomain-empty">No unexpired certificates list any subdomain of this domain.</p>
            ) : (
                <>
                    <div className="mb-3 flex flex-wrap items-end gap-3">
                        <div className="min-w-[12rem] flex-1">
                            <label htmlFor="subdomain-filter" className={labelClass}>Filter the list</label>
                            <input id="subdomain-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="api, dev, mail" className={input} autoComplete="off" />
                        </div>
                        <CopyButton text={text} label="Copy names" />
                        <DownloadButton filename={`subdomains-${data.domain}.txt`} content={text} mime="text/plain" label="Download .txt" />
                    </div>
                    <p className={`mb-2 text-xs ${muted}`} aria-live="polite">{matches.length.toLocaleString()} shown{filter ? ' after filtering' : ''}</p>
                    <ul className="grid gap-1.5 sm:grid-cols-2" data-testid="subdomain-list">
                        {shown.map((name) => <li key={name} className="rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-[13px] break-all text-gray-900 dark:bg-neutral-950 dark:text-gray-200">{name}</li>)}
                    </ul>
                    {!showAll && matches.length > PAGE && (
                        <p className="mt-3"><button type="button" className={btnSecondary} onClick={() => setShowAll(true)}>Show all {matches.length.toLocaleString()}</button></p>
                    )}
                    <p className="mt-4 text-sm">
                        <Link href={`/tools/sub-takeover?target=${encodeURIComponent(data.domain)}`} className="rounded text-blue-800 underline underline-offset-2 dark:text-blue-400">Check these names for takeover risks</Link>
                    </p>
                </>
            )}
        </div>
    );
}

export default function SubfinderPage() {
    const { tool, available } = useTool(SLUG);
    const access = useToolAccess(tool?.auth !== 'optional');
    const { initial, save } = useTargetParam();
    const [value, setValue] = useState('');
    const [ack, setAck] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const scan = useSubdomains();

    useEffect(() => { if (initial) setValue(initial); }, [initial]);

    const run = () => {
        const domain = checkDomain(value);
        if (!domain.ok) { setFormError(domain.error); return; }
        setFormError(null);
        save(domain.value);
        scan.mutate({ domain: domain.value, ack: true });
    };

    const locked = !available || access !== 'ok';

    return (
        <ToolShell slug={SLUG}>
            <AccessNotice state={access} />
            <ToolForm
                id="subfinder-domain" label="Domain" value={value} onChange={setValue} onSubmit={run}
                placeholder="example.com" buttonLabel="Find subdomains" pending={scan.isPending} disabled={locked}
                error={formError} inputMode="url" submitDisabled={!ack}
                hint="Reads public certificate transparency logs. The target itself is not contacted, and a name may no longer exist."
            >
                <AckCheckbox id="subfinder-ack" checked={ack} onChange={setAck} disabled={locked} />
            </ToolForm>

            <div className="mt-6" data-testid="subfinder-output">
                {scan.isPending && <ResultSkeleton label="Searching certificate logs" />}
                {!scan.isPending && scan.isError && <ToolErrorPanel error={scan.error} onRetry={() => scan.variables && scan.mutate(scan.variables)} />}
                {!scan.isPending && scan.data && (
                    <ResultPanel label="Subdomain results">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <ResultMeta meta={scan.data.meta} />
                            <ResultActions data={scan.data.data} filename={`subdomains-${scan.data.data.domain}`} />
                        </div>
                        <Result data={scan.data.data} />
                    </ResultPanel>
                )}
                {!scan.isPending && !scan.isError && !scan.data && <p className={`text-sm ${muted}`}>Enter a domain to list the names that public certificates have been issued for.</p>}
            </div>
        </ToolShell>
    );
}
