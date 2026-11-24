'use client';

import { useEffect, useState } from 'react';
import { ToolShell } from '@/components/tools/ToolShell';
import { ToolForm, useTargetParam } from '@/components/tools/ToolForm';
import { AccessNotice, AckCheckbox, useToolAccess } from '@/components/tools/ToolAccess';
import { Pill, ResultActions, ResultMeta, ResultPanel, ResultSkeleton, ToolErrorPanel } from '@/components/tools/ResultParts';
import { card, focusRing, muted, type Tone } from '@/components/tools/styles';
import { useTakeoverScan, useTool } from '@/hooks/queries/useTools';
import { takeoverSummary } from '@/lib/tools/summaries';
import { checkDomain, checkSubdomainList } from '@/lib/tools/validate';
import type { TakeoverResult, TakeoverStatus } from '@/types/tools';

const SLUG = 'sub-takeover';

const STATUS: Record<TakeoverStatus, { label: string; tone: Tone; order: number }> = {
    takeover_likely: { label: 'Takeover likely', tone: 'critical', order: 0 },
    potential: { label: 'Potential', tone: 'bad', order: 1 },
    error: { label: 'Check failed', tone: 'warn', order: 2 },
    blocked: { label: 'Not allowed', tone: 'warn', order: 3 },
    unresolved: { label: 'Does not resolve', tone: 'neutral', order: 4 },
    not_applicable: { label: 'No CNAME', tone: 'neutral', order: 5 },
    no_issue_found: { label: 'No issue found', tone: 'good', order: 6 },
};

function Result({ data }: { data: TakeoverResult }) {
    const rows = [...data.results].sort((a, b) => (STATUS[a.status]?.order ?? 9) - (STATUS[b.status]?.order ?? 9));
    return (
        <div className={`${card} p-5`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{data.checked} host{data.checked === 1 ? '' : 's'} checked for {data.scope}</span>
                {data.truncated && <Pill tone="warn">Only the first {data.checked} of {data.totalFound} names were checked</Pill>}
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5" data-testid="takeover-counts">
                {Object.entries(data.counts).map(([key, n]) => {
                    const s = STATUS[key as TakeoverStatus];
                    return <Pill key={key} tone={s?.tone ?? 'neutral'}>{n} {(s?.label ?? key).toLowerCase()}</Pill>;
                })}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                    <caption className="sr-only">Takeover check for each host</caption>
                    <thead className={muted}><tr><th scope="col" className="py-1.5 pr-3 font-medium">Host</th><th scope="col" className="pr-3 font-medium">Result</th><th scope="col" className="pr-3 font-medium">Points at</th><th scope="col" className="font-medium">Evidence</th></tr></thead>
                    <tbody>
                        {rows.map((row) => {
                            const s = STATUS[row.status] ?? { label: row.status, tone: 'neutral' as Tone };
                            return (
                                <tr key={row.host} className="border-t border-gray-200 align-top dark:border-neutral-800" data-testid="takeover-row" data-status={row.status}>
                                    <td className="py-2 pr-3 font-mono text-[13px] break-all">{row.host}</td>
                                    <td className="pr-3"><Pill tone={s.tone}>{s.label}</Pill></td>
                                    <td className="pr-3 text-[13px]">{row.provider && <span className="block font-medium">{row.provider}</span>}{row.cname.length > 0 && <span className="font-mono break-all">{row.cname[row.cname.length - 1]}</span>}</td>
                                    <td className="text-[13px] text-gray-800 dark:text-gray-200">{row.evidence ?? ''}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className={`mt-4 text-xs ${muted}`}>{data.note}</p>
        </div>
    );
}

export default function SubTakeoverPage() {
    const { tool, available } = useTool(SLUG);
    const access = useToolAccess(tool?.auth !== 'optional');
    const { initial, save } = useTargetParam();
    const [mode, setMode] = useState<'domain' | 'list'>('domain');
    const [domain, setDomain] = useState('');
    const [list, setList] = useState('');
    const [ack, setAck] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const scan = useTakeoverScan();

    useEffect(() => { if (initial) setDomain(initial); }, [initial]);

    const run = () => {
        setFormError(null);
        if (mode === 'domain') {
            const d = checkDomain(domain);
            if (!d.ok) { setFormError(d.error); return; }
            save(d.value);
            scan.mutate({ domain: d.value, ack: true });
        } else {
            const l = checkSubdomainList(list);
            if (!l.ok) { setFormError(l.error); return; }
            save('');
            scan.mutate({ subdomains: l.value, ack: true });
        }
    };

    const locked = !available || access !== 'ok';
    const tab = (id: 'domain' | 'list', label: string) => (
        <button
            type="button" aria-pressed={mode === id} onClick={() => { setMode(id); setFormError(null); }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${focusRing} ${mode === id ? 'bg-orange-700 text-white' : 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-neutral-800'}`}
        >{label}</button>
    );

    return (
        <ToolShell slug={SLUG}>
            <AccessNotice state={access} />
            <div role="group" aria-label="What to check" className="mb-3 inline-flex gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900/60">
                {tab('domain', 'A whole domain')}{tab('list', 'A list of hosts')}
            </div>
            <ToolForm
                key={mode}
                id={mode === 'domain' ? 'takeover-domain' : 'takeover-list'}
                label={mode === 'domain' ? 'Domain' : 'Host names (one per line, up to 20)'}
                value={mode === 'domain' ? domain : list} onChange={mode === 'domain' ? setDomain : setList} onSubmit={run}
                placeholder={mode === 'domain' ? 'example.com' : 'blog.example.com\nstatus.example.com'}
                multiline={mode === 'list'} rows={5}
                buttonLabel="Check for takeover" pending={scan.isPending} disabled={locked} error={formError} inputMode="url" submitDisabled={!ack}
                hint={mode === 'domain' ? 'Finds up to 20 subdomains in certificate logs and checks each one.' : 'Checks exactly these names.'}
            >
                <AckCheckbox id="takeover-ack" checked={ack} onChange={setAck} disabled={locked} />
            </ToolForm>

            <div className="mt-6" data-testid="takeover-output">
                {scan.isPending && <ResultSkeleton label="Checking the hosts" hint="Checking each host. This can take up to a minute for a large list. Please keep this page open." />}
                {!scan.isPending && scan.isError && <ToolErrorPanel error={scan.error} onRetry={() => scan.variables && scan.mutate(scan.variables)} />}
                {!scan.isPending && scan.data && (
                    <ResultPanel label="Takeover check results">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <ResultMeta meta={scan.data.meta} scannedAt={scan.data.data.scannedAt} />
                            <ResultActions data={scan.data.data} text={takeoverSummary(scan.data.data)} filename="takeover-check" />
                        </div>
                        <Result data={scan.data.data} />
                    </ResultPanel>
                )}
                {!scan.isPending && !scan.isError && !scan.data && <p className={`text-sm ${muted}`}>Looks for CNAMEs that point at services where the account no longer exists. Results are indicators to verify by hand, not proof.</p>}
            </div>
        </ToolShell>
    );
}
