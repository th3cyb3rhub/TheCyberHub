'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { btnGhost, input, inputError, muted } from '@/components/events/styles';
import { Field } from '@/components/internships/FormField';
import { Section } from '@/components/internships/CohortEditors';
import { formatRange } from '@/lib/events/time';
import {
    FORM_LIMITS, FORM_STATUS_LABELS, instantOf, scheduleNote, timeZoneOptions, type CtfFormValues, type FormStatus,
} from '@/lib/ctf/form';
import { CTF_SCORING_MODES } from '@/types/ctf';
import { ScoringExplainer } from '../ScoringExplainer';

type Err = (key: string) => string | undefined;

export interface SectionProps {
    values: CtfFormValues;
    set: <K extends keyof CtfFormValues>(key: K, value: CtfFormValues[K]) => void;
    err: Err;
    /** Fields the server (or the solves already on record) will not let change */
    locked: readonly string[];
}

const LOCKED_HINT = 'Locked: teams or solves already exist, so this cannot change.';

/** A labelled checkbox with a sentence that says what it does */
export function Toggle({ id, label, hint, checked, onChange, disabled, error }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; error?: string }) {
    const hintId = hint || error ? `${id}-hint` : undefined;
    return (
        <div data-field={id}>
            <label htmlFor={id} className={`flex items-start gap-3 ${disabled ? 'opacity-70' : 'cursor-pointer'}`}>
                <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={hintId}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-gray-400 text-orange-700 focus:ring-orange-500" />
                <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                    {(hint || error) && <span id={hintId} className={`mt-0.5 block text-xs ${error ? 'text-red-800 dark:text-red-300' : muted}`}>{error ?? hint}</span>}
                </span>
            </label>
        </div>
    );
}

function DateTime({ id, label, date, time, onDate, onTime, error, optional }: {
    id: string; label: string; date: string; time: string; onDate: (v: string) => void; onTime: (v: string) => void; error?: string; optional?: boolean;
}) {
    const describedBy = error ? `${id}-error` : undefined;
    return (
        <div data-field={id}>
            <p className="mb-1.5 text-sm font-medium text-gray-800 dark:text-gray-200" id={`${id}-label`}>
                {label}{!optional && <><span className="ml-0.5 text-red-700 dark:text-red-400" aria-hidden="true"> *</span><span className="sr-only"> (required)</span></>}
            </p>
            <div role="group" aria-labelledby={`${id}-label`} className="grid grid-cols-2 gap-2">
                <div>
                    <label htmlFor={`${id}-date`} className="sr-only">{label}, date</label>
                    <input id={`${id}-date`} type="date" value={date} onChange={(e) => onDate(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={`${input} ${error ? inputError : ''}`} />
                </div>
                <div>
                    <label htmlFor={`${id}-time`} className="sr-only">{label}, time</label>
                    <input id={`${id}-time`} type="time" value={time} onChange={(e) => onTime(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={`${input} ${error ? inputError : ''}`} />
                </div>
            </div>
            {error && <p id={`${id}-error`} className="mt-1 text-sm text-red-800 dark:text-red-300" aria-live="polite">{error}</p>}
        </div>
    );
}

export function WhenSection({ values, set, err, onZone }: SectionProps & { onZone: (zone: string) => void }) {
    const zones = useMemo(() => timeZoneOptions(values.timezone), [values.timezone]);
    const start = instantOf(values.startDate, values.startTime, values.timezone);
    const end = instantOf(values.endDate, values.endTime, values.timezone);
    const note = scheduleNote(values);
    return (
        <Section id="when-section" title="When" description="Players everywhere see the times converted to their own zone. The end is exclusive: the competition is over at that moment.">
            <div className="space-y-4">
                <Field id="timezone" label="Time zone" required error={err('timezone')} hint="The times below are in this zone. Changing it keeps the same moment and moves the clock times.">
                    {(p) => (
                        <select {...p} value={values.timezone} onChange={(e) => onZone(e.target.value)} className={`${input} ${err('timezone') ? inputError : ''}`}>
                            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                        </select>
                    )}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <DateTime id="start" label="Start" date={values.startDate} time={values.startTime} onDate={(v) => set('startDate', v)} onTime={(v) => set('startTime', v)} error={err('startDate')} />
                    <DateTime id="end" label="End" date={values.endDate} time={values.endTime} onDate={(v) => set('endDate', v)} onTime={(v) => set('endTime', v)} error={err('endDate')} />
                </div>
                <div>
                    <DateTime id="freeze" label="Freeze the board at" optional date={values.frozenDate} time={values.frozenTime} onDate={(v) => set('frozenDate', v)} onTime={(v) => set('frozenTime', v)} error={err('frozenAt')} />
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className={`text-xs ${muted}`}>Optional. From this moment until the end the public board stands still; staff see it live. It must fall between the start and the end.</p>
                        {(values.frozenDate || values.frozenTime) && (
                            <button type="button" className={`${btnGhost} !px-2 !py-1 text-xs`} onClick={() => { set('frozenDate', ''); set('frozenTime', ''); }}>
                                <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear the freeze
                            </button>
                        )}
                    </div>
                </div>
                {start && end && new Date(end) > new Date(start) && (
                    <div className="rounded-xl bg-gray-50 p-3 dark:bg-neutral-800/60" aria-live="polite" data-testid="time-preview">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">How it will read</p>
                        <p className="text-sm text-gray-900 dark:text-white">{formatRange({ startDate: start, endDate: end }, values.timezone, { withYear: true })}</p>
                    </div>
                )}
                {note && <p role="note" className="text-sm text-amber-900 dark:text-amber-200" data-testid="schedule-note">{note}</p>}
            </div>
        </Section>
    );
}

export function PlayersSection({ values, set, err, locked }: SectionProps) {
    const teamsLocked = locked.includes('teamsEnabled');
    const sizeLocked = locked.includes('maxTeamSize');
    return (
        <Section id="players-section" title="Players and teams">
            <div className="space-y-4">
                <Toggle id="registrationOpen" label="Registration is open" hint="While it is off, nobody new can register, create a team or join one. Players already in stay." checked={values.registrationOpen} onChange={(v) => set('registrationOpen', v)} />
                <Field id="maxParticipants" label="Player limit" error={err('maxParticipants')} hint="0 means no limit. Players, or the members of all teams, count against it.">
                    {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={FORM_LIMITS.participantsMax} value={values.maxParticipants} onChange={(e) => set('maxParticipants', e.target.value)} className={`${input} sm:max-w-xs ${err('maxParticipants') ? inputError : ''}`} />}
                </Field>
                <Toggle id="teamsEnabled" label="Teams play together" disabled={teamsLocked} error={err('teamsEnabled')}
                    hint={teamsLocked ? LOCKED_HINT : 'Players create a team or join one with an invite code, and the team scores. Off: everybody plays solo. This cannot change once teams or solves exist.'}
                    checked={values.teamsEnabled} onChange={(v) => set('teamsEnabled', v)} />
                {values.teamsEnabled && (
                    <div className="grid gap-4 sm:grid-cols-2" data-testid="team-sizes">
                        <Field id="minTeamSize" label="Smallest team that can send flags" error={err('minTeamSize')} hint={`1 to ${FORM_LIMITS.teamSizeMax}. A team below this size cannot send flags.`}>
                            {(p) => <input {...p} type="number" inputMode="numeric" min={FORM_LIMITS.minTeamSizeMin} max={FORM_LIMITS.teamSizeMax} value={values.minTeamSize} onChange={(e) => set('minTeamSize', e.target.value)} className={`${input} ${err('minTeamSize') ? inputError : ''}`} />}
                        </Field>
                        <Field id="maxTeamSize" label="Largest team" error={err('maxTeamSize')} hint={sizeLocked ? 'Locked: a team already has more members.' : `${FORM_LIMITS.teamSizeMin} to ${FORM_LIMITS.teamSizeMax}. It cannot go below the size of an existing team.`}>
                            {(p) => <input {...p} type="number" inputMode="numeric" min={FORM_LIMITS.teamSizeMin} max={FORM_LIMITS.teamSizeMax} disabled={sizeLocked} value={values.maxTeamSize} onChange={(e) => set('maxTeamSize', e.target.value)} className={`${input} ${err('maxTeamSize') ? inputError : ''}`} />}
                        </Field>
                    </div>
                )}
            </div>
        </Section>
    );
}

export function ScoringSection({ values, set, err, locked }: SectionProps) {
    const modeLocked = locked.includes('scoringMode');
    return (
        <Section id="scoring-section" title="Scoring">
            <div className="space-y-4">
                <Field id="scoringMode" label="Scoring mode" error={err('scoringMode')} hint={modeLocked ? LOCKED_HINT : 'Static: every solve pays the base points. Dynamic: the first solve pays all of it and later ones pay less. This cannot change once there are solves.'} className="sm:max-w-xs">
                    {(p) => (
                        <select {...p} value={values.scoringMode} disabled={modeLocked} onChange={(e) => set('scoringMode', e.target.value as CtfFormValues['scoringMode'])} className={input}>
                            {CTF_SCORING_MODES.map((m) => <option key={m} value={m}>{m === 'static' ? 'Static' : 'Dynamic'}</option>)}
                        </select>
                    )}
                </Field>
                <div className="rounded-xl bg-gray-50 p-4 dark:bg-neutral-800/60" data-testid="scoring-preview">
                    <ScoringExplainer mode={values.scoringMode} teamsEnabled={values.teamsEnabled} awardsPoints={values.awardsPoints} />
                </div>
                <Toggle id="awardsPoints" label="Solves also count on the global leaderboard"
                    hint="On: every solve also adds its points to the player's account, so it moves the site-wide leaderboard. Off (the default): points count on this competition's board only. It is checked at each solve, so choose before the competition starts: earlier solves are not paid or taken back later."
                    checked={values.awardsPoints} onChange={(v) => set('awardsPoints', v)} />
            </div>
        </Section>
    );
}

export function PublishingSection({ values, set, err, editing }: SectionProps & { editing: boolean }) {
    const statuses: FormStatus[] = editing
        ? ['draft', 'published', 'ended', ...(values.status === 'cancelled' ? ['cancelled' as const] : [])]
        : ['draft', 'published'];
    return (
        <Section id="publishing-section" title="Publishing">
            <div className="space-y-4">
                <Field id="status" label="Status" error={err('status')} hint="A published competition is listed and opens by its dates: upcoming, then live, then ended. Cancelling has its own button below." className="sm:max-w-lg">
                    {(p) => (
                        <select {...p} value={values.status} onChange={(e) => set('status', e.target.value as FormStatus)} className={`${input} ${err('status') ? inputError : ''}`}>
                            {statuses.map((s) => <option key={s} value={s}>{FORM_STATUS_LABELS[s]}</option>)}
                        </select>
                    )}
                </Field>
                <Toggle id="isPublic" label="Unlisted (link only)"
                    hint="On: it is left out of the public list, but anyone who has the link can open it, play it and see its boards. A draft is hidden from everyone except staff."
                    checked={!values.isPublic} onChange={(v) => set('isPublic', !v)} error={err('isPublic')} />
                <Toggle id="isFeatured" label="Featured" hint="Highlighted at the top of the list." checked={values.isFeatured} onChange={(v) => set('isFeatured', v)} error={err('isFeatured')} />
            </div>
        </Section>
    );
}
