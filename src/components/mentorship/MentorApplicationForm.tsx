'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { fieldErrors } from '@/lib/events/errors';
import { mentorshipErrorMessage } from '@/lib/mentorship/errors';
import { issuesByField, LIMITS, mentorApplicationSchema } from '@/lib/mentorship/schemas';
import { browserTimeZone, DAY_NAMES, sortSlots } from '@/lib/mentorship/time';
import type { MentorApplicationInput } from '@/lib/api/mentorship';
import type { AvailabilitySlot, ExpertiseArea, MentorOwn } from '@/types/mentorship';
import { ConductBox, ExpertisePicker, Field, fieldClass } from './shared';
import { btnGhost, btnPrimary, btnSecondary, card, label as labelClass, muted } from './styles';

interface Values {
    expertiseAreas: ExpertiseArea[];
    bio: string;
    hoursPerWeek: string;
    timezone: string;
    preferredTimes: AvailabilitySlot[];
    maxMentees: string;
    conductAccepted: boolean;
}

export function initialValues(profile?: MentorOwn | null, zone: string = browserTimeZone()): Values {
    return {
        expertiseAreas: profile?.expertiseAreas ?? [],
        bio: profile?.bio ?? '',
        hoursPerWeek: String(profile?.availability.hoursPerWeek ?? 2),
        timezone: profile?.availability.timezone ?? zone,
        preferredTimes: profile?.availability.preferredTimes ?? [],
        maxMentees: String(profile?.maxMentees ?? 3),
        conductAccepted: !!profile?.conductAcceptedAt,
    };
}

/** Form values to the API body. Returns the errors instead when the schema says no. */
export function toApplication(values: Values, needConduct: boolean): { ok: true; input: MentorApplicationInput } | { ok: false; errors: Record<string, string> } {
    const parsed = mentorApplicationSchema.safeParse({
        expertiseAreas: values.expertiseAreas,
        bio: values.bio,
        hoursPerWeek: values.hoursPerWeek.trim() === '' ? NaN : Number(values.hoursPerWeek),
        timezone: values.timezone.trim(),
        preferredTimes: values.preferredTimes,
        maxMentees: values.maxMentees.trim() === '' ? NaN : Number(values.maxMentees),
        conductAccepted: needConduct ? values.conductAccepted : true,
    });
    if (!parsed.success) return { ok: false, errors: issuesByField(parsed.error) };
    const v = parsed.data;
    return {
        ok: true,
        input: {
            expertiseAreas: v.expertiseAreas as ExpertiseArea[],
            bio: v.bio,
            availability: { hoursPerWeek: v.hoursPerWeek, timezone: v.timezone, preferredTimes: sortSlots(v.preferredTimes) },
            maxMentees: v.maxMentees,
            conductAccepted: true,
        },
    };
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const timeZones = (): string[] => {
    try {
        const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
        return intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : [];
    } catch {
        return [];
    }
};

export function MentorApplicationForm({ mode, profile, pending, error, onSubmit, submitLabel }: {
    mode: 'apply' | 'edit';
    profile?: MentorOwn | null;
    pending: boolean;
    error: unknown;
    onSubmit: (input: MentorApplicationInput) => void;
    submitLabel: string;
}) {
    const [values, setValues] = useState<Values>(() => initialValues(profile));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const zones = useMemo(timeZones, []);
    const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

    // What the server said about a field wins until the person edits again
    const serverErrors = useMemo(() => {
        const raw = fieldErrors(error);
        const out: Record<string, string> = {};
        for (const [k, msg] of Object.entries(raw)) out[k.replace(/^availability\./, '').replace(/\.\d+.*$/, '')] = msg;
        return out;
    }, [error]);
    const shown = { ...serverErrors, ...errors };
    const generalError = error && Object.keys(serverErrors).length === 0 ? mentorshipErrorMessage(error) : null;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const result = toApplication(values, mode === 'apply');
        if (!result.ok) {
            setErrors(result.errors);
            const first = Object.keys(result.errors)[0];
            document.getElementById(`mentor-${first}`)?.focus();
            return;
        }
        setErrors({});
        onSubmit(result.input);
    };

    const addSlot = () => set('preferredTimes', [...values.preferredTimes, { dayOfWeek: 1, startHour: 18, endHour: 20 }]);
    const editSlot = (i: number, patch: Partial<AvailabilitySlot>) => set('preferredTimes', values.preferredTimes.map((s, j) => (j === i ? { ...s, ...patch } : s)));

    return (
        <form onSubmit={submit} noValidate className="space-y-6" data-testid="mentor-form">
            <ExpertisePicker value={values.expertiseAreas} onChange={(v) => set('expertiseAreas', v)} max={LIMITS.mentorAreas} error={shown.expertiseAreas} />

            <Field id="mentor-bio" label="About you" hint={`Who you are, what you have done and how you like to mentor (${LIMITS.bio.min} to ${LIMITS.bio.max} characters).`} error={shown.bio}>
                <textarea id="mentor-bio" rows={6} value={values.bio} onChange={(e) => set('bio', e.target.value)} maxLength={LIMITS.bio.max + 200} className={`${fieldClass(shown.bio)} resize-y`} aria-invalid={!!shown.bio} aria-describedby={shown.bio ? 'mentor-bio-error' : 'mentor-bio-hint'} />
                <p className={`mt-1 text-right text-xs ${muted}`} aria-hidden="true">{values.bio.trim().length}/{LIMITS.bio.max}</p>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field id="mentor-hoursPerWeek" label="Hours per week" hint="1 to 20" error={shown.hoursPerWeek}>
                    <input id="mentor-hoursPerWeek" type="number" inputMode="numeric" min={LIMITS.hoursPerWeek.min} max={LIMITS.hoursPerWeek.max} value={values.hoursPerWeek} onChange={(e) => set('hoursPerWeek', e.target.value)} className={fieldClass(shown.hoursPerWeek)} aria-invalid={!!shown.hoursPerWeek} />
                </Field>
                <Field id="mentor-maxMentees" label="Mentees at once" hint="1 to 5" error={shown.maxMentees}>
                    <select id="mentor-maxMentees" value={values.maxMentees} onChange={(e) => set('maxMentees', e.target.value)} className={fieldClass(shown.maxMentees)}>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                </Field>
                <Field id="mentor-timezone" label="Your time zone" hint="Your hours below are read in this zone." error={shown.timezone}>
                    <input id="mentor-timezone" list="mentor-zones" value={values.timezone} onChange={(e) => set('timezone', e.target.value)} className={fieldClass(shown.timezone)} autoComplete="off" aria-invalid={!!shown.timezone} />
                    <datalist id="mentor-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
                </Field>
            </div>

            <fieldset>
                <legend className={labelClass}>Usual hours <span className={`font-normal ${muted}`}>(optional, up to {LIMITS.slots})</span></legend>
                <p className={`mb-3 text-xs ${muted}`}>Mentees see these in their own time zone. They only suggest when you are free; anyone can still propose another time.</p>
                {values.preferredTimes.length > 0 && (
                    <ul className="mb-3 space-y-2">
                        {values.preferredTimes.map((slot, i) => (
                            <li key={i} className={`${card} flex flex-wrap items-end gap-2 p-3`}>
                                <div>
                                    <label htmlFor={`slot-day-${i}`} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Day</label>
                                    <select id={`slot-day-${i}`} value={slot.dayOfWeek} onChange={(e) => editSlot(i, { dayOfWeek: Number(e.target.value) })} className={fieldClass()}>
                                        {DAY_NAMES.map((d, n) => <option key={d} value={n}>{d}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor={`slot-start-${i}`} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">From</label>
                                    <select id={`slot-start-${i}`} value={slot.startHour} onChange={(e) => editSlot(i, { startHour: Number(e.target.value) })} className={fieldClass()}>
                                        {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor={`slot-end-${i}`} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">To</label>
                                    <select id={`slot-end-${i}`} value={slot.endHour} onChange={(e) => editSlot(i, { endHour: Number(e.target.value) })} className={fieldClass(slot.endHour <= slot.startHour ? 'bad' : undefined)}>
                                        {HOURS.map((h) => h + 1).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                                    </select>
                                </div>
                                <button type="button" className={`${btnGhost} !px-3`} onClick={() => set('preferredTimes', values.preferredTimes.filter((_, j) => j !== i))} aria-label={`Remove ${DAY_NAMES[slot.dayOfWeek]} slot`}>
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                                {slot.endHour <= slot.startHour && <p role="alert" className="w-full text-sm text-red-700 dark:text-red-400">A time slot must end after it starts.</p>}
                            </li>
                        ))}
                    </ul>
                )}
                <button type="button" className={btnSecondary} onClick={addSlot} disabled={values.preferredTimes.length >= LIMITS.slots}><Plus className="h-4 w-4" aria-hidden="true" /> Add hours</button>
                {shown.preferredTimes && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{shown.preferredTimes}</p>}
            </fieldset>

            {mode === 'apply' && <ConductBox audience="mentor" checked={values.conductAccepted} onChange={(v) => set('conductAccepted', v)} error={shown.conductAccepted} />}

            {generalError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200" data-testid="form-error">{generalError}</p>}

            <button type="submit" className={btnPrimary} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {submitLabel}
            </button>
        </form>
    );
}
