'use client';

import { Check, Circle } from 'lucide-react';
import { assessPassword } from '@/lib/passwordStrength';

const BAR = {
    adaptive: ['bg-gray-300 dark:bg-white/10', 'bg-red-600 dark:bg-red-500', 'bg-amber-600 dark:bg-yellow-500', 'bg-blue-600 dark:bg-blue-500', 'bg-green-600 dark:bg-green-500'],
    dark: ['bg-white/10', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'],
};
const TEXT = {
    adaptive: ['text-gray-600 dark:text-gray-400', 'text-red-700 dark:text-red-400', 'text-amber-800 dark:text-yellow-400', 'text-blue-700 dark:text-blue-400', 'text-green-700 dark:text-green-400'],
    dark: ['text-gray-400', 'text-red-400', 'text-yellow-400', 'text-blue-400', 'text-green-400'],
};
const RULE = {
    adaptive: { met: 'text-green-700 dark:text-green-400', unmet: 'text-gray-600 dark:text-gray-400' },
    dark: { met: 'text-green-400', unmet: 'text-gray-400' },
};

/**
 * Strength hint and rule checklist for a password field. A hint only: it blocks nothing. The sentence
 * under the bar is a polite live region that changes when the verdict or the missing rules change
 * (not on every key), so a screen reader hears the result without a stream of updates.
 */
export function PasswordStrength({ password, id, tone = 'adaptive' }: {
    password: string;
    /** Id of the block, for the field's `aria-describedby` */
    id: string;
    /** `dark` for a page that is dark in both themes */
    tone?: 'adaptive' | 'dark';
}) {
    if (!password) return null;
    const { level, label, checks, missing } = assessPassword(password);
    const summary = missing.length === 0 ? `Password strength: ${label}.` : `Password strength: ${label}. Still needed: ${missing.join(', ')}.`;

    return (
        <div id={id} className="mt-3 space-y-2" data-testid="password-strength">
            <div className="flex gap-1" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= level ? BAR[tone][level] : BAR[tone][0]}`} />
                ))}
            </div>
            <p role="status" aria-live="polite" className={`text-xs font-medium ${TEXT[tone][level]}`}>{summary}</p>
            <ul className="grid grid-cols-1 gap-1 text-xs min-[420px]:grid-cols-2">
                {checks.map((check) => (
                    <li key={check.id} className={`flex items-center gap-1.5 ${check.met ? RULE[tone].met : RULE[tone].unmet}`}>
                        {check.met ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : <Circle className="h-3 w-3 shrink-0" aria-hidden="true" />}
                        {check.label}
                        <span className="sr-only">{check.met ? ' (done)' : ' (still needed)'}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
