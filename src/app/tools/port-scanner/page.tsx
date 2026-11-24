'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { ToolShell } from '@/components/tools/ToolShell';
import { CopyButton } from '@/components/tools/ResultParts';
import { card, focusRing, input, label as labelClass, muted, codeBlock } from '@/components/tools/styles';
import { buildNmapCommand, DEFAULT_OPTIONS, validatePortList, validateTarget, type ScanType, type Timing } from '@/lib/tools/nmap';
import { matchesPort, PORT_PRESETS, PORTS, type PortPreset } from '@/lib/tools/ports';

const SLUG = 'port-scanner';
const CUSTOM: PortPreset = { id: 'custom', label: 'Custom', ports: [] };
const PRESETS = [...PORT_PRESETS, CUSTOM];

function Check({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
    return (
        <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" />
            <span>{children}</span>
        </label>
    );
}

function CommandBuilder() {
    const [target, setTarget] = useState(DEFAULT_OPTIONS.target);
    const [preset, setPreset] = useState<PortPreset>(PRESETS[1]);
    const [customPorts, setCustomPorts] = useState('');
    const [scanType, setScanType] = useState<ScanType>(DEFAULT_OPTIONS.scanType);
    const [serviceVersion, setServiceVersion] = useState(DEFAULT_OPTIONS.serviceVersion);
    const [defaultScripts, setDefaultScripts] = useState(DEFAULT_OPTIONS.defaultScripts);
    const [skipPing, setSkipPing] = useState(DEFAULT_OPTIONS.skipPing);
    const [timing, setTiming] = useState<Timing>(DEFAULT_OPTIONS.timing);
    const [saveOutput, setSaveOutput] = useState(DEFAULT_OPTIONS.saveOutput);

    const targetCheck = target.trim() ? validateTarget(target) : null;
    const portsCheck = preset.id === 'custom' && customPorts.trim() ? validatePortList(customPorts) : null;
    const command = useMemo(
        () => buildNmapCommand({ target, preset, customPorts, scanType, serviceVersion, defaultScripts, skipPing, timing, saveOutput }),
        [target, preset, customPorts, scanType, serviceVersion, defaultScripts, skipPing, timing, saveOutput],
    );
    const ready = !!targetCheck?.ok && (preset.id !== 'custom' || !!portsCheck?.ok);

    return (
        <section className={`${card} p-5`} aria-labelledby="nmap-builder" data-testid="nmap-builder">
            <h2 id="nmap-builder" className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">Nmap command builder</h2>
            <p className={`mb-4 text-sm ${muted}`}>Builds a command for you to run on your own machine against hosts you own or have written permission to scan. This site never scans anything.</p>

            <div className="mb-4">
                <label htmlFor="nmap-target" className={labelClass}>Target</label>
                <input id="nmap-target" type="text" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="scanme.nmap.org or 192.168.1.0/24" className={input} autoComplete="off" spellCheck={false} aria-invalid={targetCheck ? !targetCheck.ok : undefined} aria-describedby="nmap-target-msg" />
                <p id="nmap-target-msg" className={`mt-1 text-xs ${targetCheck && !targetCheck.ok ? 'text-red-800 dark:text-red-300' : muted}`} role={targetCheck && !targetCheck.ok ? 'alert' : undefined}>
                    {targetCheck && !targetCheck.ok ? targetCheck.error : 'A host name, IP address or CIDR range.'}
                </p>
            </div>

            <fieldset className="mb-4">
                <legend className={labelClass}>Ports</legend>
                <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                        <button key={p.id} type="button" aria-pressed={preset.id === p.id} onClick={() => setPreset(p)}
                            className={`rounded-full border px-3 py-1 text-sm ${focusRing} ${preset.id === p.id ? 'border-orange-700 bg-orange-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}
                        >{p.label}</button>
                    ))}
                </div>
                {preset.id === 'custom' && (
                    <div className="mt-3">
                        <label htmlFor="nmap-ports" className={labelClass}>Port list</label>
                        <input id="nmap-ports" type="text" value={customPorts} onChange={(e) => setCustomPorts(e.target.value)} placeholder="22,80,443,8000-8100" className={input} autoComplete="off" spellCheck={false} aria-invalid={portsCheck ? !portsCheck.ok : undefined} />
                        {portsCheck && !portsCheck.ok && <p role="alert" className="mt-1 text-xs text-red-800 dark:text-red-300">{portsCheck.error}</p>}
                    </div>
                )}
                {preset.ports.length > 0 && <p className={`mt-2 font-mono text-xs ${muted}`}>{preset.ports.join(', ')}</p>}
            </fieldset>

            <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="nmap-scan" className={labelClass}>Scan type</label>
                    <select id="nmap-scan" value={scanType} onChange={(e) => setScanType(e.target.value as ScanType)} className={input}>
                        <option value="connect">TCP connect (-sT), no special rights</option>
                        <option value="syn">SYN scan (-sS), needs root</option>
                        <option value="udp">UDP (-sU), slow, needs root</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="nmap-timing" className={labelClass}>Speed</label>
                    <select id="nmap-timing" value={timing} onChange={(e) => setTiming(e.target.value as Timing)} className={input}>
                        <option value="T2">Polite (-T2)</option>
                        <option value="T3">Normal (-T3)</option>
                        <option value="T4">Fast (-T4), for reliable networks</option>
                    </select>
                </div>
            </div>
            <div className="mb-5 grid gap-2 sm:grid-cols-2">
                <Check id="nmap-sv" checked={serviceVersion} onChange={setServiceVersion}>Detect service versions (-sV)</Check>
                <Check id="nmap-sc" checked={defaultScripts} onChange={setDefaultScripts}>Run default scripts (-sC)</Check>
                <Check id="nmap-pn" checked={skipPing} onChange={setSkipPing}>Skip host discovery (-Pn)</Check>
                <Check id="nmap-oa" checked={saveOutput} onChange={setSaveOutput}>Save all output formats (-oA)</Check>
            </div>

            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Command</h3>
            <pre className={codeBlock} data-testid="nmap-command"><code>{command}</code></pre>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <CopyButton text={command} label="Copy command" />
                {!ready && <span className={`text-xs ${muted}`}>Fill in the placeholders before running it.</span>}
            </div>
        </section>
    );
}

function PortTable() {
    const [query, setQuery] = useState('');
    const rows = useMemo(() => PORTS.filter((p) => matchesPort(p, query)), [query]);
    return (
        <section className={`${card} mt-6 p-5`} aria-labelledby="port-reference">
            <h2 id="port-reference" className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">Common ports</h2>
            <p className={`mb-4 text-sm ${muted}`}>What usually listens where, and what to look at first.</p>
            <label htmlFor="port-filter" className={labelClass}>Filter by number or service</label>
            <input id="port-filter" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="443, ssh, database" className={`${input} mb-3 sm:max-w-sm`} autoComplete="off" />
            <p className={`mb-2 text-xs ${muted}`} aria-live="polite">{rows.length} of {PORTS.length} ports</p>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm" data-testid="port-table">
                    <caption className="sr-only">Common ports and services</caption>
                    <thead className={muted}><tr><th scope="col" className="py-1.5 pr-3 font-medium">Port</th><th scope="col" className="pr-3 font-medium">Service</th><th scope="col" className="pr-3 font-medium">What it is</th><th scope="col" className="font-medium">Worth knowing</th></tr></thead>
                    <tbody>
                        {rows.map((p) => (
                            <tr key={p.port} className="border-t border-gray-200 align-top dark:border-neutral-800">
                                <td className="py-1.5 pr-3 font-mono">{p.port}</td><td className="pr-3 font-medium">{p.service}</td><td className="pr-3">{p.description}</td><td className="text-[13px]">{p.note ?? ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length === 0 && <p className={`py-4 text-sm ${muted}`}>No port matches that. Try a number or a service name.</p>}
            </div>
        </section>
    );
}

export default function PortReferencePage() {
    return (
        <ToolShell
            slug={SLUG}
            notice={(
                <div role="note" className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                    <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p>This page does not scan hosts. A browser cannot open raw connections, and scanning from our servers would be abuse. Use the builder to prepare an Nmap command, and see the <Link href="/cheatsheets/networking" className="font-medium underline underline-offset-2">networking cheatsheet</Link> for how to read the results.</p>
                </div>
            )}
        >
            <CommandBuilder />
            <PortTable />
        </ToolShell>
    );
}
