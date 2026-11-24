'use client';

import { useEffect, useState } from 'react';
import { ToolShell } from '@/components/tools/ToolShell';
import { ToolForm, useTargetParam } from '@/components/tools/ToolForm';
import { DataRow, Pill, ResultActions, ResultMeta, ResultPanel, ResultSkeleton, ToolErrorPanel } from '@/components/tools/ResultParts';
import { card, muted } from '@/components/tools/styles';
import { useIp, useTool } from '@/hooks/queries/useTools';
import { ipSummary } from '@/lib/tools/summaries';
import { checkIp } from '@/lib/tools/validate';
import type { IpResult } from '@/types/tools';

const SLUG = 'ip-lookup';

function Result({ data }: { data: IpResult }) {
    const n = data.network;
    return (
        <div className={`${card} p-5`}>
            <dl>
                <DataRow label="Address"><span className="font-mono">{data.ip}</span> <Pill>IPv{data.version}</Pill></DataRow>
                <DataRow label="Type">{data.public ? <Pill tone="good">Public address</Pill> : <Pill tone="warn">{data.classification}</Pill>}</DataRow>
                {!data.public && <DataRow label="Note"><span className={muted}>This address is not routed on the public internet, so no ownership record exists for it and nothing was looked up.</span></DataRow>}
                {data.public && (
                    <DataRow label="Reverse DNS">
                        {data.reverseDns.length ? <ul className="space-y-0.5 font-mono text-[13px]">{data.reverseDns.map((h) => <li key={h}>{h}</li>)}</ul> : <span className={muted}>No reverse record</span>}
                    </DataRow>
                )}
                {n && (
                    <>
                        <DataRow label="Network name">{n.name ?? <span className={muted}>Not published</span>}{n.handle && <span className={muted}> ({n.handle})</span>}</DataRow>
                        <DataRow label="Range"><span className="font-mono text-[13px]">{n.startAddress ?? '?'} - {n.endAddress ?? '?'}</span></DataRow>
                        {n.cidr.length > 0 && <DataRow label="CIDR"><span className="font-mono text-[13px]">{n.cidr.join(', ')}</span></DataRow>}
                        {n.type && <DataRow label="Allocation">{n.type}</DataRow>}
                        {n.country && <DataRow label="Registered country">{n.country} <span className={`text-xs ${muted}`}>(where the block is registered, not where a user is)</span></DataRow>}
                        {n.status.length > 0 && <DataRow label="Status"><span className="flex flex-wrap gap-1.5">{n.status.map((s) => <Pill key={s}>{s}</Pill>)}</span></DataRow>}
                    </>
                )}
                <DataRow label="Source">{data.source ? `RDAP registry data` : 'Classified locally'}. This tool does not give a physical location.</DataRow>
            </dl>
        </div>
    );
}

export default function IpLookupPage() {
    const { available } = useTool(SLUG);
    const { initial, save } = useTargetParam();
    const [value, setValue] = useState('');
    const [submitted, setSubmitted] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const query = useIp(submitted);

    useEffect(() => { if (initial) setValue(initial); }, [initial]);

    const run = () => {
        const checked = checkIp(value);
        if (!checked.ok) { setFormError(checked.error); return; }
        setFormError(null);
        save(checked.value);
        if (checked.value === submitted) query.refetch();
        else setSubmitted(checked.value);
    };

    return (
        <ToolShell slug={SLUG}>
            <ToolForm
                id="ip-address" label="IP address" value={value} onChange={setValue} onSubmit={run}
                placeholder="8.8.8.8 or 2606:4700:4700::1111" buttonLabel="Look up" pending={query.isFetching} disabled={!available}
                error={formError} hint="Shows who the network belongs to and its reverse DNS name. It does not guess a location." inputMode="text"
            />
            <div className="mt-6" data-testid="ip-output">
                {query.isFetching && <ResultSkeleton label="Looking up the address" />}
                {!query.isFetching && query.isError && <ToolErrorPanel error={query.error} onRetry={() => query.refetch()} />}
                {!query.isFetching && query.data && (
                    <ResultPanel label="IP result">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <ResultMeta meta={query.data.meta} />
                            <ResultActions data={query.data.data} text={ipSummary(query.data.data)} filename={`ip-${query.data.data.ip.replace(/[:.]/g, '_')}`} />
                        </div>
                        <Result data={query.data.data} />
                    </ResultPanel>
                )}
                {!submitted && !query.isFetching && <p className={`text-sm ${muted}`}>Enter an IPv4 or IPv6 address. Private and reserved addresses are recognised without a lookup.</p>}
            </div>
        </ToolShell>
    );
}
