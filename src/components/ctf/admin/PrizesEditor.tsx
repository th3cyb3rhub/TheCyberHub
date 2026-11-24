'use client';

import { Plus, Trash2 } from 'lucide-react';
import { btnSecondary, focusRing, input, inputError, muted } from '@/components/events/styles';
import { FORM_LIMITS, newPrize, nextPlace, type PrizeRow } from '@/lib/ctf/form';
import { placeLabel } from '@/lib/ctf/display';

type Errors = Record<string, string>;

const iconBtn = `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-red-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-red-300 dark:hover:bg-neutral-800 ${focusRing}`;

/** Prizes as `{ place, reward }` rows, at most ten. The reward is plain text: it is shown as text, never as markup. */
export function PrizesEditor({ rows, onChange, errors, error }: { rows: PrizeRow[]; onChange: (rows: PrizeRow[]) => void; errors: Errors; error?: string }) {
    const update = (index: number, patch: Partial<PrizeRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    const full = rows.length >= FORM_LIMITS.prizesMax;

    return (
        <div data-testid="prizes-editor">
            {rows.length === 0 ? (
                <p className={`text-sm ${muted}`}>No prizes yet. Add one for each place that wins something.</p>
            ) : (
                <ul className="space-y-3" aria-label="Prizes">
                    {rows.map((row, i) => {
                        const placeError = errors[`prizes.${i}.place`];
                        const rewardError = errors[`prizes.${i}.reward`];
                        const n = Number(row.place);
                        const name = Number.isInteger(n) && n > 0 ? `${placeLabel(n)} place` : `Prize ${i + 1}`;
                        return (
                            <li key={row.key} className="grid grid-cols-[5.5rem_1fr_auto] items-start gap-2 sm:gap-3" data-testid="prize-row">
                                <div>
                                    <label htmlFor={`prize-place-${row.key}`} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Place</label>
                                    <input id={`prize-place-${row.key}`} type="number" inputMode="numeric" min={1} max={FORM_LIMITS.placeMax} value={row.place}
                                        onChange={(e) => update(i, { place: e.target.value })}
                                        aria-invalid={placeError ? true : undefined} aria-describedby={placeError ? `prize-place-${row.key}-error` : undefined}
                                        className={`${input} ${placeError ? inputError : ''}`} />
                                </div>
                                <div className="min-w-0">
                                    <label htmlFor={`prize-reward-${row.key}`} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Prize for {name}</label>
                                    <input id={`prize-reward-${row.key}`} type="text" value={row.reward} maxLength={FORM_LIMITS.prizeRewardMax + 20}
                                        onChange={(e) => update(i, { reward: e.target.value })}
                                        aria-invalid={rewardError ? true : undefined} aria-describedby={rewardError ? `prize-reward-${row.key}-error` : undefined}
                                        className={`${input} ${rewardError ? inputError : ''}`} placeholder="For example: 500 USD voucher" />
                                </div>
                                <div className="pt-[1.375rem]">
                                    <button type="button" className={iconBtn} onClick={() => onChange(rows.filter((_, k) => k !== i))} aria-label={`Remove the prize for ${name}`}>
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>
                                {(placeError || rewardError) && (
                                    <div className="col-span-3 -mt-1 space-y-0.5" aria-live="polite">
                                        {placeError && <p id={`prize-place-${row.key}-error`} className="text-sm text-red-800 dark:text-red-300">{placeError}</p>}
                                        {rewardError && <p id={`prize-reward-${row.key}-error`} className="text-sm text-red-800 dark:text-red-300">{rewardError}</p>}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {error && <p className="mt-2 text-sm text-red-800 dark:text-red-300" role="alert">{error}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" className={btnSecondary} disabled={full} onClick={() => onChange([...rows, newPrize(nextPlace(rows))])}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Add a prize
                </button>
                <p className={`text-xs ${muted}`}>{rows.length} of {FORM_LIMITS.prizesMax}</p>
            </div>
        </div>
    );
}
