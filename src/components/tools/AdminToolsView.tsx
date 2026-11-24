'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, PauseCircle, PlayCircle, Plus, RefreshCw, X } from 'lucide-react';
import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAdminToolSettings, useAdminToolStats, useUpdateToolSettings } from '@/hooks/queries/useTools';
import { toolErrorMessage, disabledMessage } from '@/lib/tools/errors';
import { FALLBACK_TOOLS } from '@/lib/tools/registry';
import { checkDomain } from '@/lib/tools/validate';
import { isAdminRole } from '@/lib/events/roles';
import type { AdminToolState } from '@/types/tools';
import { Pill } from './ResultParts';
import { btnPrimary, btnSecondary, card, focusRing, input, label as labelClass, muted } from './styles';

// Reasons an administrator cannot change from here: they come from the server's environment
const ENV_REASONS = new Set(['master_off', 'kill_switch', 'active_off']);

const toolName = (id: string) => FALLBACK_TOOLS.find((t) => t.id === id)?.name ?? id;

function Banner({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
    return (
        <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${tone === 'error' ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100' : 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'}`}>
            {tone === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>{children}</span>
        </div>
    );
}

function ToolRow({ tool, onToggle, onCap, busy }: {
    tool: AdminToolState;
    onToggle: (tool: AdminToolState) => void;
    onCap: (tool: AdminToolState, cap: number | null) => void;
    busy: boolean;
}) {
    const [cap, setCap] = useState(tool.dailyCap === null ? '' : String(tool.dailyCap));
    const [capError, setCapError] = useState<string | null>(null);
    useEffect(() => { setCap(tool.dailyCap === null ? '' : String(tool.dailyCap)); }, [tool.dailyCap]);

    const envLocked = !!tool.reason && ENV_REASONS.has(tool.reason);
    const pct = tool.dailyCap ? Math.min(100, Math.round((tool.usedToday / tool.dailyCap) * 100)) : 0;
    const fieldId = `cap-${tool.id}`;

    const saveCap = () => {
        const text = cap.trim();
        if (text === '') { onCap(tool, null); setCapError(null); return; }
        const n = Number(text);
        if (!Number.isInteger(n) || n < 0 || n > 1_000_000) { setCapError('Enter a whole number from 0 to 1,000,000, or leave empty for the default.'); return; }
        setCapError(null);
        onCap(tool, n);
    };

    return (
        <li className={`${card} p-4`} data-testid="admin-tool-row" data-tool={tool.id} data-enabled={tool.enabled}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{toolName(tool.id)}</h3>
                        <Pill>{tool.mode === 'active' ? 'Connects to targets' : 'Public data only'}</Pill>
                        {tool.enabled ? <Pill tone="good">On</Pill> : <Pill tone="bad">Paused</Pill>}
                    </div>
                    {!tool.enabled && tool.reason && <p className={`text-sm ${muted}`}>{disabledMessage(tool.reason)}{envLocked ? ' This comes from the server settings and cannot be changed here.' : ''}</p>}
                </div>
                <button
                    type="button" onClick={() => onToggle(tool)} disabled={busy || envLocked}
                    className={tool.enabled ? btnSecondary : btnPrimary}
                    aria-label={`${tool.enabled ? 'Pause' : 'Resume'} ${toolName(tool.id)}`}
                >
                    {tool.enabled ? <PauseCircle className="h-4 w-4" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />}
                    {tool.enabled ? 'Pause' : 'Resume'}
                </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                    <p className={`mb-1 text-sm ${muted}`}>Used today (UTC)</p>
                    <p className="text-sm text-gray-900 dark:text-white" data-testid="used-today">
                        {tool.usedToday.toLocaleString()}{tool.dailyCap !== null ? ` of ${tool.dailyCap.toLocaleString()}` : ' (no cap)'}
                    </p>
                    {tool.dailyCap !== null && (
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${toolName(tool.id)} daily cap used`}>
                            <div className={`h-full ${pct >= 90 ? 'bg-red-600' : pct >= 70 ? 'bg-amber-600' : 'bg-emerald-600'}`} style={{ width: `${pct}%` }} />
                        </div>
                    )}
                </div>
                <div>
                    <label htmlFor={fieldId} className={labelClass}>Daily cap (default {tool.defaultDailyCap === null ? 'none' : tool.defaultDailyCap.toLocaleString()})</label>
                    <div className="flex gap-2">
                        <input
                            id={fieldId} type="text" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Default"
                            aria-invalid={!!capError} aria-describedby={capError ? `${fieldId}-error` : undefined} className={input} autoComplete="off"
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveCap(); } }}
                        />
                        <button type="button" className={btnSecondary} onClick={saveCap} disabled={busy}>Save</button>
                    </div>
                    {capError && <p id={`${fieldId}-error`} role="alert" className="mt-1 text-sm text-red-800 dark:text-red-300">{capError}</p>}
                    <p className={`mt-1 text-xs ${muted}`}>A cap can only lower the built-in limit. Empty goes back to the default.</p>
                </div>
            </div>
        </li>
    );
}

function BlockedTargets({ targets, onSave, busy }: { targets: string[]; onSave: (list: string[]) => void; busy: boolean }) {
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);

    const add = () => {
        const checked = checkDomain(value);
        if (!checked.ok) { setError(checked.error); return; }
        if (targets.includes(checked.value)) { setError('That domain is already blocked.'); return; }
        setError(null);
        setValue('');
        onSave([...targets, checked.value]);
    };

    return (
        <section className={`${card} p-5`} aria-labelledby="blocked-targets">
            <h2 id="blocked-targets" className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">Blocked targets</h2>
            <p className={`mb-4 text-sm ${muted}`}>Domains (and their subdomains) that no tool will contact, for owners who asked to opt out. Changes apply within 15 seconds.</p>
            <form className="mb-4 flex flex-col gap-2 sm:flex-row" noValidate onSubmit={(e) => { e.preventDefault(); add(); }}>
                <div className="flex-1">
                    <label htmlFor="blocked-domain" className={labelClass}>Domain to block</label>
                    <input id="blocked-domain" type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder="example.org" className={input} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? 'blocked-error' : undefined} />
                    {error && <p id="blocked-error" role="alert" className="mt-1 text-sm text-red-800 dark:text-red-300">{error}</p>}
                </div>
                <button type="submit" className={`${btnSecondary} self-start sm:mt-[1.7rem]`} disabled={busy}><Plus className="h-4 w-4" aria-hidden="true" /> Block</button>
            </form>
            {targets.length === 0 ? (
                <p className={`text-sm ${muted}`} data-testid="no-blocked">No domains are blocked.</p>
            ) : (
                <ul className="flex flex-wrap gap-2" data-testid="blocked-list">
                    {targets.map((t) => (
                        <li key={t} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-3 pr-1.5 font-mono text-sm text-gray-900 dark:bg-neutral-800 dark:text-gray-100">
                            {t}
                            <button type="button" onClick={() => onSave(targets.filter((x) => x !== t))} disabled={busy} aria-label={`Unblock ${t}`} className={`rounded-full p-1 hover:bg-gray-200 dark:hover:bg-neutral-700 ${focusRing}`}>
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function Stats() {
    const [days, setDays] = useState(7);
    const stats = useAdminToolStats(days);
    const ids = stats.data ? Object.keys(stats.data.tools).sort() : [];
    const reasons = stats.data ? Object.entries(stats.data.blockedReasons).sort((a, b) => b[1] - a[1]) : [];
    return (
        <section className={`${card} p-5`} aria-labelledby="tool-stats">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 id="tool-stats" className="text-lg font-semibold text-gray-900 dark:text-white">Usage</h2>
                    <p className={`text-sm ${muted}`}>Runs by outcome, from the run log (kept 30 days).</p>
                </div>
                <div>
                    <label htmlFor="stats-days" className={labelClass}>Period</label>
                    <select id="stats-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className={input}>
                        {[1, 7, 14, 30].map((d) => <option key={d} value={d}>{d === 1 ? 'Last day' : `Last ${d} days`}</option>)}
                    </select>
                </div>
            </div>
            {stats.isLoading && <div role="status" aria-label="Loading usage" className="space-y-2">{[60, 80, 50].map((w) => <div key={w} className="h-4 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" style={{ width: `${w}%` }} />)}</div>}
            {stats.isError && <Banner tone="error">{toolErrorMessage(stats.error)} <button type="button" className="underline" onClick={() => stats.refetch()}>Try again</button></Banner>}
            {stats.data && (
                ids.length === 0 ? <p className={`text-sm ${muted}`} data-testid="no-stats">No runs in this period.</p> : (
                    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Usage by tool, scrolls sideways on small screens">
                        <table className="w-full min-w-[30rem] text-left text-sm" data-testid="stats-table">
                            <caption className="sr-only">Runs by tool and outcome</caption>
                            <thead className={muted}><tr><th scope="col" className="py-1.5 pr-3 font-medium">Tool</th><th scope="col" className="pr-3 text-right font-medium">OK</th><th scope="col" className="pr-3 text-right font-medium">Cached</th><th scope="col" className="pr-3 text-right font-medium">Blocked</th><th scope="col" className="pr-3 text-right font-medium">Limited</th><th scope="col" className="text-right font-medium">Errors</th></tr></thead>
                            <tbody>
                                {ids.map((id) => {
                                    const row = stats.data.tools[id];
                                    return (
                                        <tr key={id} className="border-t border-gray-200 dark:border-neutral-800">
                                            <th scope="row" className="py-1.5 pr-3 font-medium">{toolName(id)}</th>
                                            <td className="pr-3 text-right tabular-nums">{row.ok.toLocaleString()}</td>
                                            <td className="pr-3 text-right tabular-nums">{row.cached.toLocaleString()}</td>
                                            <td className="pr-3 text-right tabular-nums">{row.blocked.toLocaleString()}</td>
                                            <td className="pr-3 text-right tabular-nums">{row.limited.toLocaleString()}</td>
                                            <td className="text-right tabular-nums">{row.error.toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )
            )}
            {reasons.length > 0 && (
                <div className="mt-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Why targets were blocked</h3>
                    <ul className="flex flex-wrap gap-2" data-testid="blocked-reasons">{reasons.map(([reason, n]) => <li key={reason}><Pill>{reason}: {n}</Pill></li>)}</ul>
                </div>
            )}
        </section>
    );
}

export function AdminToolsView() {
    const { user, ready } = useRequireLogin('/admin/tools');
    const allowed = ready && isAdminRole(user?.role);
    const settings = useAdminToolSettings(allowed);
    const update = useUpdateToolSettings();
    const [confirm, setConfirm] = useState<AdminToolState | null>(null);
    const [saved, setSaved] = useState<string | null>(null);

    if (!ready) return <FullPageSpinner label="Loading" />;
    if (!allowed) return <NoAccess message="Only administrators can change the security tools settings." href="/admin" label="Back to admin" />;

    const run = (change: Parameters<typeof update.mutate>[0], message: string) => {
        setSaved(null);
        update.mutate(change, { onSuccess: () => setSaved(message) });
    };
    const toggle = (tool: AdminToolState) => {
        if (tool.enabled) setConfirm(tool);
        else run({ tools: { [tool.id]: { enabled: true } } }, `${toolName(tool.id)} is back on.`);
    };

    const data = settings.data;
    return (
        <PageShell title="Security tools" subtitle="Switch tools off, lower daily caps and block targets. Changes reach every server within 15 seconds." backHref="/admin" backLabel="Admin" wide
            actions={<button type="button" className={btnSecondary} onClick={() => settings.refetch()} disabled={settings.isFetching}><RefreshCw className={`h-4 w-4 ${settings.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh</button>}>
            {saved && <Banner tone="ok">{saved}</Banner>}
            {update.isError && <Banner tone="error">{toolErrorMessage(update.error)}</Banner>}

            {settings.isLoading && <div role="status" aria-label="Loading settings" className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading settings</div>}
            {settings.isError && (
                <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-5 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="admin-tools-error">
                    <p className="mb-2 font-semibold">Could not load the settings</p>
                    <p className="mb-3">{toolErrorMessage(settings.error)}</p>
                    <button type="button" className={btnSecondary} onClick={() => settings.refetch()}>Try again</button>
                </div>
            )}

            {data && (
                <div className="space-y-8">
                    <section className="flex flex-wrap gap-2" aria-label="Environment">
                        <Pill tone={data.masterEnabled ? 'good' : 'bad'}>Master switch: {data.masterEnabled ? 'on' : 'off'}</Pill>
                        <Pill tone={data.activeToolsAllowed ? 'good' : 'warn'} title="Tools that connect to a target are off by default in production until an operator turns them on.">Tools that connect to targets: {data.activeToolsAllowed ? 'allowed' : 'off in this environment'}</Pill>
                    </section>

                    <section aria-labelledby="tool-switches">
                        <h2 id="tool-switches" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Tools</h2>
                        <ul className="space-y-3" data-testid="admin-tools">
                            {data.tools.map((tool) => (
                                <ToolRow key={tool.id} tool={tool} busy={update.isPending}
                                    onToggle={toggle}
                                    onCap={(t, cap) => run({ tools: { [t.id]: { dailyCap: cap } } }, cap === null ? `${toolName(t.id)} uses its default cap.` : `${toolName(t.id)} cap set to ${cap.toLocaleString()} a day.`)} />
                            ))}
                        </ul>
                    </section>

                    <BlockedTargets targets={data.blockedTargets} busy={update.isPending} onSave={(list) => run({ blockedTargets: list }, 'Blocked targets saved.')} />
                    <Stats />
                </div>
            )}

            <ConfirmDialog
                open={!!confirm}
                title={confirm ? `Pause ${toolName(confirm.id)}?` : undefined}
                description="Visitors will see that the tool is paused and cannot run it until you resume it."
                confirmText="Pause tool"
                variant="warning"
                onCancel={() => setConfirm(null)}
                onConfirm={() => {
                    if (confirm) run({ tools: { [confirm.id]: { enabled: false } } }, `${toolName(confirm.id)} is paused.`);
                    setConfirm(null);
                }}
            />
        </PageShell>
    );
}
