'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ToolShell } from '@/components/tools/ToolShell';
import { ToolForm, useTargetParam } from '@/components/tools/ToolForm';
import { AccessNotice, AckCheckbox, useToolAccess } from '@/components/tools/ToolAccess';
import { DataRow, Pill, ResultActions, ResultMeta, ResultPanel, ResultSkeleton, ToolErrorPanel } from '@/components/tools/ResultParts';
import { card, muted, type Tone } from '@/components/tools/styles';
import { useHeaderScan, useTool } from '@/hooks/queries/useTools';
import { headersSummary } from '@/lib/tools/summaries';
import { checkHttpUrl } from '@/lib/tools/validate';
import type { CheckStatus, HeaderCheck, HeadersResult } from '@/types/tools';

const SLUG = 'header-analyzer';

const STATUS: Record<CheckStatus, { label: string; tone: Tone; order: number }> = {
    fail: { label: 'Fail', tone: 'bad', order: 0 },
    warn: { label: 'Warning', tone: 'warn', order: 1 },
    info: { label: 'Info', tone: 'info', order: 2 },
    pass: { label: 'Pass', tone: 'good', order: 3 },
    na: { label: 'Not applicable', tone: 'neutral', order: 4 },
};

function Check({ check }: { check: HeaderCheck }) {
    const s = STATUS[check.status] ?? STATUS.info;
    return (
        <li className="border-b border-gray-200 py-3 last:border-b-0 dark:border-neutral-800" data-testid="header-check" data-status={check.status}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
                <Pill tone={s.tone}>{s.label}</Pill>
                {check.header && <span className="font-mono text-[13px] text-gray-900 dark:text-white">{check.header}</span>}
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-200">{check.message}</p>
            {check.value && <p className={`mt-1 break-all font-mono text-xs ${muted}`}>{check.value}</p>}
        </li>
    );
}

function Result({ data }: { data: HeadersResult }) {
    const checks = [...data.checks].sort((a, b) => (STATUS[a.status]?.order ?? 9) - (STATUS[b.status]?.order ?? 9));
    const redirected = data.redirects.length > 0;
    return (
        <div className="space-y-4">
            <div className={`${card} p-5`}>
                <dl>
                    <DataRow label="Requested"><span className="break-all font-mono text-[13px]">{data.requestedUrl}</span></DataRow>
                    <DataRow label="Final address"><span className="break-all font-mono text-[13px]">{data.finalUrl}</span></DataRow>
                    <DataRow label="Status"><Pill tone={data.status < 400 ? 'good' : 'warn'}>{data.status} {data.statusText}</Pill></DataRow>
                    <DataRow label="Summary">
                        <span className="flex flex-wrap gap-1.5">
                            {(['fail', 'warn', 'info', 'pass'] as CheckStatus[]).map((k) => <Pill key={k} tone={STATUS[k].tone}>{data.summary[k] ?? 0} {STATUS[k].label.toLowerCase()}</Pill>)}
                        </span>
                    </DataRow>
                </dl>
                {redirected && (
                    <div className="mt-3" data-testid="redirect-chain">
                        <h3 className="mb-1.5 text-sm font-semibold text-gray-900 dark:text-white">Redirects</h3>
                        <ol className="space-y-1 text-[13px]">
                            {data.redirects.map((hop, i) => (
                                <li key={i} className="flex flex-wrap items-center gap-1.5 font-mono">
                                    <span className="break-all">{hop.url ?? hop.from}</span>
                                    {hop.status && <Pill>{hop.status}</Pill>}
                                    <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                                    <span className="break-all">{hop.location ?? hop.to}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}
            </div>

            <section className={`${card} p-5`} aria-labelledby="header-checks">
                <h2 id="header-checks" className="mb-1 text-base font-semibold text-gray-900 dark:text-white">Security header review</h2>
                <p className={`mb-2 text-xs ${muted}`}>There is no overall grade: each line says what was found and why it matters.</p>
                <ul>{checks.map((c) => <Check key={c.id} check={c} />)}</ul>
            </section>

            {data.cookies.length > 0 && (
                <section className={`${card} overflow-x-auto p-5`} aria-labelledby="header-cookies">
                    <h2 id="header-cookies" className="mb-2 text-base font-semibold text-gray-900 dark:text-white">Cookies</h2>
                    <p className={`mb-2 text-xs ${muted}`}>Cookie values are never shown or stored.</p>
                    <table className="w-full text-left text-sm">
                        <thead className={muted}><tr><th className="py-1.5 pr-3 font-medium">Name</th><th className="pr-3 font-medium">Secure</th><th className="pr-3 font-medium">HttpOnly</th><th className="font-medium">SameSite</th></tr></thead>
                        <tbody>
                            {data.cookies.map((c) => (
                                <tr key={c.name} className="border-t border-gray-200 dark:border-neutral-800">
                                    <td className="py-1.5 pr-3 font-mono text-[13px]">{c.name}</td>
                                    <td className="pr-3">{c.secure ? 'Yes' : 'No'}</td>
                                    <td className="pr-3">{c.httpOnly ? 'Yes' : 'No'}</td>
                                    <td>{c.sameSite ?? 'Not set'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            <details className={`${card} p-5`}>
                <summary className="cursor-pointer text-base font-semibold text-gray-900 dark:text-white">All response headers ({data.headers.length})</summary>
                <dl className="mt-3">
                    {data.headers.map((h, i) => <DataRow key={`${h.name}-${i}`} label={h.name}><span className="break-all font-mono text-[13px]">{h.value}</span></DataRow>)}
                </dl>
            </details>
        </div>
    );
}

export default function HeaderAnalyzerPage() {
    const { tool, available } = useTool(SLUG);
    const access = useToolAccess(tool?.auth !== 'optional');
    const { initial, save } = useTargetParam();
    const [value, setValue] = useState('');
    const [ack, setAck] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const scan = useHeaderScan();

    useEffect(() => { if (initial) setValue(initial); }, [initial]);

    const run = () => {
        const checked = checkHttpUrl(value);
        if (!checked.ok) { setFormError(checked.error); return; }
        if (!ack) { setFormError('Confirm that you may test this target first.'); return; }
        setFormError(null);
        save(checked.value);
        scan.mutate({ url: checked.value, ack: true });
    };

    const locked = !available || access !== 'ok';

    return (
        <ToolShell slug={SLUG}>
            <AccessNotice state={access} />
            <ToolForm
                id="header-url" label="URL to check" value={value} onChange={setValue} onSubmit={run}
                placeholder="https://example.com" buttonLabel="Analyze headers" pending={scan.isPending} disabled={locked}
                error={formError} inputMode="url" submitDisabled={!ack}
                hint="We fetch the page once from our server and only read the headers. Private, loopback and internal addresses are refused."
            >
                <AckCheckbox id="header-ack" checked={ack} onChange={setAck} disabled={locked} />
            </ToolForm>

            <div className="mt-6" data-testid="header-output">
                {scan.isPending && <ResultSkeleton label="Fetching the headers" />}
                {!scan.isPending && scan.isError && <ToolErrorPanel error={scan.error} onRetry={() => scan.variables && scan.mutate(scan.variables)} />}
                {!scan.isPending && scan.data && (
                    <ResultPanel label="Header analysis">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <ResultMeta meta={scan.data.meta} scannedAt={scan.data.data.scannedAt} />
                            <ResultActions data={scan.data.data} text={headersSummary(scan.data.data)} filename="http-headers" />
                        </div>
                        <Result data={scan.data.data} />
                    </ResultPanel>
                )}
                {!scan.isPending && !scan.isError && !scan.data && <p className={`text-sm ${muted}`}>Enter an address to review its security headers, cookies and redirects.</p>}
            </div>
        </ToolShell>
    );
}
