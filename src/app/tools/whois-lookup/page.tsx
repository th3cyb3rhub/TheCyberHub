'use client';

import { useEffect, useState } from 'react';
import { ToolShell } from '@/components/tools/ToolShell';
import { ToolForm, useTargetParam } from '@/components/tools/ToolForm';
import { DataRow, Pill, ResultActions, ResultMeta, ResultPanel, ResultSkeleton, ToolErrorPanel } from '@/components/tools/ResultParts';
import { card, muted } from '@/components/tools/styles';
import { useTool, useWhois } from '@/hooks/queries/useTools';
import { checkDomain } from '@/lib/tools/validate';
import { whoisSummary } from '@/lib/tools/summaries';
import type { WhoisResult } from '@/types/tools';

const SLUG = 'whois-lookup';

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not published');

const daysUntil = (iso: string | null) => (iso ? Math.floor((Date.parse(iso) - Date.now()) / 86_400_000) : null);

function Result({ data }: { data: WhoisResult }) {
    const left = daysUntil(data.expires);
    return (
        <div className={`${card} p-5`}>
            <dl>
                <DataRow label="Domain"><span className="font-mono">{data.domain}</span></DataRow>
                <DataRow label="Registrar">{data.registrar ?? <span className={muted}>Not published</span>}</DataRow>
                <DataRow label="Created">{formatDate(data.created)}</DataRow>
                <DataRow label="Expires">
                    {formatDate(data.expires)}
                    {left !== null && left < 0 && <> <Pill tone="bad">Expired {-left} days ago</Pill></>}
                    {left !== null && left >= 0 && left <= 30 && <> <Pill tone="warn">In {left} days</Pill></>}
                </DataRow>
                <DataRow label="Last changed">{formatDate(data.updated)}</DataRow>
                <DataRow label="Status">
                    {data.status.length ? <span className="flex flex-wrap gap-1.5">{data.status.map((s) => <Pill key={s}>{s}</Pill>)}</span> : <span className={muted}>None listed</span>}
                </DataRow>
                <DataRow label="Name servers">
                    {data.nameservers.length ? <ul className="space-y-0.5 font-mono text-[13px]">{data.nameservers.map((n) => <li key={n}>{n}</li>)}</ul> : <span className={muted}>None listed</span>}
                </DataRow>
                <DataRow label="DNSSEC">{data.dnssec === null ? <span className={muted}>Unknown</span> : data.dnssec ? <Pill tone="good">Signed</Pill> : <Pill tone="warn">Unsigned</Pill>}</DataRow>
                <DataRow label="Source">RDAP{data.rdapServer ? ` (${data.rdapServer})` : ''}. Registrant contact details are not returned.</DataRow>
            </dl>
        </div>
    );
}

export default function WhoisPage() {
    const { available } = useTool(SLUG);
    const { initial, save } = useTargetParam();
    const [value, setValue] = useState('');
    const [submitted, setSubmitted] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const query = useWhois(submitted);

    useEffect(() => { if (initial) setValue(initial); }, [initial]);

    const run = () => {
        const checked = checkDomain(value);
        if (!checked.ok) { setFormError(checked.error); return; }
        setFormError(null);
        save(checked.value);
        if (checked.value === submitted) query.refetch();
        else setSubmitted(checked.value);
    };

    return (
        <ToolShell slug={SLUG}>
            <ToolForm
                id="whois-domain" label="Domain name" value={value} onChange={setValue} onSubmit={run}
                placeholder="example.com" buttonLabel="Look up" pending={query.isFetching} disabled={!available}
                error={formError} hint="Reads the registry's public RDAP service. A pasted URL is reduced to its host name." inputMode="url"
            />
            <div className="mt-6" data-testid="whois-output">
                {query.isFetching && <ResultSkeleton label="Looking up the domain" />}
                {!query.isFetching && query.isError && <ToolErrorPanel error={query.error} onRetry={() => query.refetch()} />}
                {!query.isFetching && query.data && (
                    <ResultPanel label="WHOIS result">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <ResultMeta meta={query.data.meta} />
                            <ResultActions data={query.data.data} text={whoisSummary(query.data.data)} filename={`whois-${query.data.data.domain}`} />
                        </div>
                        <Result data={query.data.data} />
                    </ResultPanel>
                )}
                {!submitted && !query.isFetching && <p className={`text-sm ${muted}`}>Enter a domain to see who registered it, when it expires and which name servers it uses.</p>}
            </div>
        </ToolShell>
    );
}
