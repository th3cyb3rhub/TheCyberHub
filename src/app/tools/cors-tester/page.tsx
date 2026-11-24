'use client';

import { useEffect, useState } from 'react';
import { ToolShell } from '@/components/tools/ToolShell';
import { ToolForm, useTargetParam } from '@/components/tools/ToolForm';
import { AccessNotice, AckCheckbox, useToolAccess } from '@/components/tools/ToolAccess';
import { DataRow, Pill, ResultActions, ResultMeta, ResultPanel, ResultSkeleton, ToolErrorPanel } from '@/components/tools/ResultParts';
import { card, input, label as labelClass, muted, type Tone } from '@/components/tools/styles';
import { useCorsScan, useTool } from '@/hooks/queries/useTools';
import { checkHttpUrl, checkOrigins, urlWithoutQuery } from '@/lib/tools/validate';
import type { CorsResult, CorsSeverity } from '@/types/tools';

const SLUG = 'cors-tester';

const SEVERITY: Record<CorsSeverity, { label: string; tone: Tone }> = {
    info: { label: 'Info', tone: 'info' },
    low: { label: 'Low', tone: 'neutral' },
    medium: { label: 'Medium', tone: 'warn' },
    high: { label: 'High', tone: 'bad' },
    critical: { label: 'Critical', tone: 'critical' },
};

const header = (headers: Record<string, string> | undefined, name: string) => headers?.[name] ?? '';

function corsSummary(r: CorsResult): string {
    return [
        `URL: ${r.url}`,
        `Worst finding: ${SEVERITY[r.severity].label}`,
        ...r.results.map((x) => `${x.origin}: ${SEVERITY[x.severity].label}; allow-origin ${header(x.simple.headers, 'access-control-allow-origin') || 'none'}; credentials ${header(x.simple.headers, 'access-control-allow-credentials') || 'none'}`),
        ...r.findings.map((f) => `[${f.severity.toUpperCase()}] ${f.origin ?? ''} ${f.message}`),
    ].join('\n');
}

function Result({ data }: { data: CorsResult }) {
    const worst = SEVERITY[data.severity];
    return (
        <div className="space-y-4">
            <div className={`${card} p-5`}>
                <dl>
                    <DataRow label="URL"><span className="break-all font-mono text-[13px]">{data.url}</span></DataRow>
                    <DataRow label="Worst result"><Pill tone={worst.tone}>{worst.label}</Pill></DataRow>
                    <DataRow label="Origins tried">{data.results.length}</DataRow>
                </dl>
            </div>

            <section className={`${card} p-5`} aria-labelledby="cors-findings">
                <h2 id="cors-findings" className="mb-2 text-base font-semibold text-gray-900 dark:text-white">Findings</h2>
                {data.findings.length === 0 ? (
                    <p className={`text-sm ${muted}`} data-testid="cors-no-findings">No problems found for the origins tried. Browsers will not let those origins read the response unless the site allows them on purpose.</p>
                ) : (
                    <ul>
                        {data.findings.map((f, i) => (
                            <li key={`${f.code}-${f.origin}-${i}`} className="border-b border-gray-200 py-2.5 last:border-b-0 dark:border-neutral-800" data-testid="cors-finding">
                                <div className="mb-1 flex flex-wrap items-center gap-2">
                                    <Pill tone={SEVERITY[f.severity].tone}>{SEVERITY[f.severity].label}</Pill>
                                    {f.origin && <span className="break-all font-mono text-[13px]">Origin: {f.origin}</span>}
                                </div>
                                <p className="text-sm text-gray-800 dark:text-gray-200">{f.message}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className={`${card} overflow-x-auto p-5`} aria-labelledby="cors-origins">
                <h2 id="cors-origins" className="mb-2 text-base font-semibold text-gray-900 dark:text-white">Per origin</h2>
                <table className="w-full min-w-[34rem] text-left text-sm">
                    <caption className="sr-only">CORS response headers for each origin tried</caption>
                    <thead className={muted}><tr><th scope="col" className="py-1.5 pr-3 font-medium">Origin sent</th><th scope="col" className="pr-3 font-medium">Allow-Origin</th><th scope="col" className="pr-3 font-medium">Credentials</th><th scope="col" className="pr-3 font-medium">Methods (preflight)</th><th scope="col" className="font-medium">Result</th></tr></thead>
                    <tbody>
                        {data.results.map((r) => (
                            <tr key={r.origin} className="border-t border-gray-200 align-top dark:border-neutral-800" data-testid="cors-row">
                                <td className="py-2 pr-3 font-mono text-[13px] break-all">{r.origin}</td>
                                <td className="pr-3 font-mono text-[13px] break-all">{header(r.simple.headers, 'access-control-allow-origin') || <span className={muted}>none</span>}</td>
                                <td className="pr-3">{header(r.simple.headers, 'access-control-allow-credentials') || <span className={muted}>none</span>}</td>
                                <td className="pr-3 font-mono text-[13px]">{header(r.preflight.headers, 'access-control-allow-methods') || <span className={muted}>none</span>}</td>
                                <td><Pill tone={SEVERITY[r.severity].tone}>{SEVERITY[r.severity].label}</Pill></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}

export default function CorsTesterPage() {
    const { tool, available } = useTool(SLUG);
    const access = useToolAccess(tool?.auth !== 'optional');
    const { initial, save } = useTargetParam();
    const [value, setValue] = useState('');
    const [origins, setOrigins] = useState('');
    const [ack, setAck] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [originError, setOriginError] = useState<string | null>(null);
    const scan = useCorsScan();

    useEffect(() => { if (initial) setValue(initial); }, [initial]);

    const run = () => {
        const url = checkHttpUrl(value);
        if (!url.ok) { setFormError(url.error); return; }
        const list = checkOrigins(origins);
        setFormError(null);
        if (!list.ok) { setOriginError(list.error); return; }
        setOriginError(null);
        save(urlWithoutQuery(url.value));
        scan.mutate({ url: url.value, origins: list.value, ack: true });
    };

    const locked = !available || access !== 'ok';

    return (
        <ToolShell slug={SLUG}>
            <AccessNotice state={access} />
            <ToolForm
                id="cors-url" label="URL to test" value={value} onChange={setValue} onSubmit={run}
                placeholder="https://api.example.com/v1/user" buttonLabel="Test CORS" pending={scan.isPending} disabled={locked}
                error={formError} inputMode="url" submitDisabled={!ack}
                hint="Our server sends the request, because a browser cannot read another site's CORS headers reliably. Only the CORS headers come back, never the page."
            >
                <div>
                    <label htmlFor="cors-origins-input" className={labelClass}>Origins to try (optional, one per line, up to 5)</label>
                    <textarea
                        id="cors-origins-input" rows={3} value={origins} onChange={(e) => setOrigins(e.target.value)}
                        placeholder={'https://evil.example\nnull'} spellCheck={false} aria-invalid={!!originError} aria-describedby={originError ? 'cors-origins-error' : undefined}
                        className={`${input} font-mono`}
                    />
                    {originError && <p id="cors-origins-error" role="alert" className="mt-1 text-sm text-red-800 dark:text-red-300">{originError}</p>}
                    <p className={`mt-1 text-xs ${muted}`}>Leave empty to try an unrelated origin, the null origin and look-alikes of the target.</p>
                </div>
                <AckCheckbox id="cors-ack" checked={ack} onChange={setAck} disabled={locked} />
            </ToolForm>

            <div className="mt-6" data-testid="cors-output">
                {scan.isPending && <ResultSkeleton label="Testing the origins" />}
                {!scan.isPending && scan.isError && <ToolErrorPanel error={scan.error} onRetry={() => scan.variables && scan.mutate(scan.variables)} />}
                {!scan.isPending && scan.data && (
                    <ResultPanel label="CORS test result">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <ResultMeta meta={scan.data.meta} scannedAt={scan.data.data.scannedAt} />
                            <ResultActions data={scan.data.data} text={corsSummary(scan.data.data)} filename="cors-test" />
                        </div>
                        <Result data={scan.data.data} />
                    </ResultPanel>
                )}
                {!scan.isPending && !scan.isError && !scan.data && <p className={`text-sm ${muted}`}>Enter a URL to see how it answers requests from other origins.</p>}
            </div>
        </ToolShell>
    );
}
