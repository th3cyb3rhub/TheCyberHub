'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ToolShell } from '@/components/tools/ToolShell';
import { ToolForm, useTargetParam } from '@/components/tools/ToolForm';
import { AccessNotice, AckCheckbox, useToolAccess } from '@/components/tools/ToolAccess';
import { DataRow, Pill, ResultActions, ResultMeta, ResultPanel, ResultSkeleton, ToolErrorPanel } from '@/components/tools/ResultParts';
import { card, focusRing, input, label as labelClass, muted, type Tone } from '@/components/tools/styles';
import { useSslCheck, useTool } from '@/hooks/queries/useTools';
import { sslSummary } from '@/lib/tools/summaries';
import { checkHost, checkPort } from '@/lib/tools/validate';
import type { SslCertificate, SslResult, SslSeverity } from '@/types/tools';

const SLUG = 'ssl-checker';

const SEVERITY: Record<SslSeverity, { label: string; tone: Tone }> = {
    info: { label: 'Info', tone: 'info' },
    low: { label: 'Low', tone: 'neutral' },
    medium: { label: 'Medium', tone: 'warn' },
    high: { label: 'High', tone: 'bad' },
};

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown');
const name = (dn: Record<string, string>) => dn.CN ?? dn.O ?? 'Unknown';

function Expiry({ cert }: { cert: SslCertificate }) {
    const left = cert.daysRemaining;
    if (left === null) return <>{date(cert.validTo)}</>;
    const tone: Tone = left < 0 ? 'bad' : left <= 14 ? 'bad' : left <= 30 ? 'warn' : 'good';
    return <>{date(cert.validTo)} <Pill tone={tone}>{left < 0 ? `Expired ${-left} days ago` : `${left} days left`}</Pill></>;
}

function Result({ data }: { data: SslResult }) {
    const cert = data.certificate;
    return (
        <div className="space-y-4">
            <div className={`${card} p-5`}>
                <p className={`mb-3 text-xs ${muted}`} data-testid="ssl-note">{data.note}</p>
                <dl>
                    <DataRow label="Endpoint"><span className="font-mono">{data.host}:{data.port}</span></DataRow>
                    <DataRow label="Trusted chain">{data.verified ? <Pill tone="good">Verified</Pill> : <><Pill tone="bad">Not verified</Pill> <span className={`text-xs ${muted}`}>{data.verificationError ?? ''}</span></>}</DataRow>
                    <DataRow label="Name match">{data.hostnameMatch ? <Pill tone="good">Certificate covers this name</Pill> : <><Pill tone="bad">Name mismatch</Pill> <span className={`text-xs ${muted}`}>{data.hostnameError ?? ''}</span></>}</DataRow>
                    <DataRow label="Protocol">{data.protocol ?? 'Unknown'}</DataRow>
                    <DataRow label="Cipher">{data.cipher ? <span className="font-mono text-[13px]">{data.cipher.name}</span> : 'Unknown'}</DataRow>
                    {data.alpn && <DataRow label="ALPN">{String(data.alpn)}</DataRow>}
                    <DataRow label="Subject">{name(cert.subject)}</DataRow>
                    <DataRow label="Issuer">{name(cert.issuer)}</DataRow>
                    <DataRow label="Valid from">{date(cert.validFrom)}</DataRow>
                    <DataRow label="Valid until"><Expiry cert={cert} /></DataRow>
                    <DataRow label="Public key">{cert.key.type ?? 'Unknown'}{cert.key.curve ? ` ${cert.key.curve}` : ''}{cert.key.bits ? `, ${cert.key.bits} bits` : ''}</DataRow>
                    {cert.fingerprint256 && <DataRow label="SHA-256"><span className="break-all font-mono text-[12px]">{cert.fingerprint256}</span></DataRow>}
                </dl>
            </div>

            <section className={`${card} p-5`} aria-labelledby="ssl-findings">
                <h2 id="ssl-findings" className="mb-2 text-base font-semibold text-gray-900 dark:text-white">Findings</h2>
                {data.findings.length === 0 ? (
                    <p className={`text-sm ${muted}`} data-testid="ssl-no-findings">No problems found in what this handshake negotiated.</p>
                ) : (
                    <ul>
                        {data.findings.map((f, i) => (
                            <li key={`${f.code}-${i}`} className="flex flex-wrap items-start gap-2 border-b border-gray-200 py-2.5 last:border-b-0 dark:border-neutral-800" data-testid="ssl-finding">
                                <Pill tone={SEVERITY[f.severity]?.tone ?? 'neutral'}>{SEVERITY[f.severity]?.label ?? f.severity}</Pill>
                                <span className="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-200">{f.message}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {data.chain.length > 0 && (
                <section className={`${card} overflow-x-auto p-5`} aria-labelledby="ssl-chain">
                    <h2 id="ssl-chain" className="mb-2 text-base font-semibold text-gray-900 dark:text-white">Certificate chain</h2>
                    <table className="w-full min-w-[30rem] text-left text-sm">
                        <caption className="sr-only">Certificates the server sent, leaf first</caption>
                        <thead className={muted}><tr><th scope="col" className="py-1.5 pr-3 font-medium">#</th><th scope="col" className="pr-3 font-medium">Subject</th><th scope="col" className="pr-3 font-medium">Issuer</th><th scope="col" className="font-medium">Expires</th></tr></thead>
                        <tbody>
                            {data.chain.map((c, i) => (
                                <tr key={`${c.fingerprint256 ?? i}`} className="border-t border-gray-200 dark:border-neutral-800">
                                    <td className="py-1.5 pr-3">{i + 1}</td><td className="pr-3">{name(c.subject)}</td><td className="pr-3">{name(c.issuer)}</td><td>{date(c.validTo)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            {cert.sans && cert.sans.length > 0 && (
                <details className={`${card} p-5`}>
                    <summary className="cursor-pointer text-base font-semibold text-gray-900 dark:text-white">Names on the certificate ({cert.sans.length})</summary>
                    <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                        {cert.sans.map((s, i) => <li key={`${s.value}-${i}`} className="rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-[13px] break-all dark:bg-neutral-950">{s.value}</li>)}
                    </ul>
                </details>
            )}

            {data.sslLabsUrl && (
                <p className="text-sm">
                    <a href={data.sslLabsUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 rounded text-blue-800 underline underline-offset-2 dark:text-blue-400 ${focusRing}`}>
                        Full assessment with a grade on SSL Labs <ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                    </a>
                </p>
            )}
        </div>
    );
}

export default function SslCheckerPage() {
    const { tool, available } = useTool(SLUG);
    const access = useToolAccess(tool?.auth !== 'optional');
    const { initial, save } = useTargetParam();
    const [value, setValue] = useState('');
    const [port, setPort] = useState('443');
    const [ack, setAck] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [portError, setPortError] = useState<string | null>(null);
    const scan = useSslCheck();

    useEffect(() => { if (initial) setValue(initial); }, [initial]);

    const run = () => {
        const host = checkHost(value);
        if (!host.ok) { setFormError(host.error); return; }
        setFormError(null);
        const p = checkPort(port || '443');
        if (!p.ok) { setPortError(p.error); return; }
        setPortError(null);
        save(host.value);
        scan.mutate({ host: host.value, port: p.value, ack: true });
    };

    const locked = !available || access !== 'ok';

    return (
        <ToolShell slug={SLUG}>
            <AccessNotice state={access} />
            <ToolForm
                id="ssl-host" label="Host name or IP address" value={value} onChange={setValue} onSubmit={run}
                placeholder="example.com" buttonLabel="Check certificate" pending={scan.isPending} disabled={locked}
                error={formError} inputMode="url" submitDisabled={!ack}
                hint="Our server opens one TLS connection and reports what it sees. It gives facts, not a letter grade."
            >
                <div className="sm:max-w-[10rem]">
                    <label htmlFor="ssl-port" className={labelClass}>Port</label>
                    <input id="ssl-port" type="text" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} className={input} aria-invalid={!!portError} aria-describedby={portError ? 'ssl-port-error' : undefined} autoComplete="off" />
                    {portError && <p id="ssl-port-error" role="alert" className="mt-1 text-sm text-red-800 dark:text-red-300">{portError}</p>}
                </div>
                <AckCheckbox id="ssl-ack" checked={ack} onChange={setAck} disabled={locked} />
            </ToolForm>

            <div className="mt-6" data-testid="ssl-output">
                {scan.isPending && <ResultSkeleton label="Connecting and reading the certificate" />}
                {!scan.isPending && scan.isError && <ToolErrorPanel error={scan.error} onRetry={() => scan.variables && scan.mutate(scan.variables)} />}
                {!scan.isPending && scan.data && (
                    <ResultPanel label="TLS check result">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <ResultMeta meta={scan.data.meta} scannedAt={scan.data.data.scannedAt} />
                            <ResultActions data={scan.data.data} text={sslSummary(scan.data.data)} filename={`tls-${scan.data.data.host}`} />
                        </div>
                        <Result data={scan.data.data} />
                    </ResultPanel>
                )}
                {!scan.isPending && !scan.isError && !scan.data && <p className={`text-sm ${muted}`}>Enter a host to see its certificate chain, expiry, protocol and cipher.</p>}
            </div>
        </ToolShell>
    );
}
