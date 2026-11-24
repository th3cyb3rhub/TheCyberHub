/**
 * The tools screens use the same class strings as the events screens: plain gray and neutral
 * palettes with `dark:` variants, so a card reads on the light page as well as the dark one.
 */
export {
    body, btnDanger, btnGhost, btnPrimary, btnSecondary, card, cardPad, chip, focusRing, heading, input, inputError,
    label, muted, pageBg,
} from '@/components/events/styles';

/** Result severity and check status colours: always paired with a word, never colour alone */
export const tone = {
    good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300',
    warn: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
    bad: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300',
    critical: 'bg-red-200 text-red-950 dark:bg-red-500/25 dark:text-red-200',
    info: 'bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300',
    neutral: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300',
} as const;

export type Tone = keyof typeof tone;

export const mono = 'font-mono text-[13px] break-all';
export const codeBlock = 'overflow-x-auto rounded-xl border border-gray-200 bg-gray-100 p-3 text-xs text-gray-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-gray-200';
