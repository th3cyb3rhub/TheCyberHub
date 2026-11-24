import { Ban, CheckCircle2, Clock, FileEdit, Snowflake, SignalHigh, SignalLow, SignalMedium, Skull } from 'lucide-react';
import { chip } from '@/components/events/styles';
import { STATUS_LABELS } from '@/lib/ctf/constants';
import { difficultyLabel } from '@/lib/ctf/display';
import type { CtfStatus } from '@/types/ctf';

const STATUS_STYLES: Record<CtfStatus, { className: string; icon?: React.ElementType }> = {
    draft: { className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', icon: FileEdit },
    upcoming: { className: 'bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300', icon: Clock },
    live: { className: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300' },
    frozen: { className: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-500/15 dark:text-cyan-300', icon: Snowflake },
    ended: { className: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300', icon: CheckCircle2 },
    cancelled: { className: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300', icon: Ban },
};

/** Colour never carries the meaning alone: every status has an icon and a word */
export function CtfStatusBadge({ status, className = '' }: { status: CtfStatus; className?: string }) {
    const s = STATUS_STYLES[status] ?? STATUS_STYLES.upcoming;
    const Icon = s.icon;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-status={status}>
            {status === 'live' ? (
                <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                </span>
            ) : Icon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
            {STATUS_LABELS[status] ?? status}
        </span>
    );
}

const DIFFICULTY_STYLES: Record<string, { className: string; icon: React.ElementType }> = {
    easy: { className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300', icon: SignalLow },
    medium: { className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', icon: SignalMedium },
    hard: { className: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300', icon: SignalHigh },
    insane: { className: 'bg-purple-100 text-purple-900 dark:bg-purple-500/15 dark:text-purple-300', icon: Skull },
};

export function CtfDifficultyBadge({ difficulty, className = '' }: { difficulty: string; className?: string }) {
    const s = DIFFICULTY_STYLES[difficulty.toLowerCase()] ?? DIFFICULTY_STYLES.medium;
    const Icon = s.icon;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-difficulty={difficulty}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {difficultyLabel(difficulty)}
        </span>
    );
}

/** A neutral fact such as "Teams of 2 to 4" */
export function Pill({ icon: Icon, children, className = '' }: { icon?: React.ElementType; children: React.ReactNode; className?: string }) {
    return (
        <span className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200 ${className}`}>
            {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
            {children}
        </span>
    );
}
