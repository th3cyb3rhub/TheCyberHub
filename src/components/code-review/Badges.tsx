import { CheckCircle2, Circle, FileEdit, Globe, PlayCircle, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';
import { chip } from '@/components/events/styles';
import { DIFFICULTY_LABELS, SEVERITY_LABELS, STATUS_LABELS, categoryLabel, languageLabel } from '@/lib/codeReview/constants';
import type { CrViewerStatus } from '@/types/codeReview';

type Style = { className: string; icon: React.ElementType };

/** Colour never carries the meaning alone: every badge has an icon and a word */
const STATUS_STYLES: Record<CrViewerStatus, Style> = {
    'not-started': { className: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300', icon: Circle },
    'in-progress': { className: 'bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300', icon: PlayCircle },
    passed: { className: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300', icon: CheckCircle2 },
};

const DIFFICULTY_STYLES: Record<string, Style> = {
    easy: { className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300', icon: SignalLow },
    medium: { className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', icon: SignalMedium },
    hard: { className: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300', icon: SignalHigh },
};

const SEVERITY_STYLES: Record<string, string> = {
    low: 'bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300',
    medium: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
    high: 'bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300',
    critical: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300',
};

export function StatusBadge({ status, className = '' }: { status: CrViewerStatus; className?: string }) {
    const s = STATUS_STYLES[status] ?? STATUS_STYLES['not-started'];
    const Icon = s.icon;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-status={status}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {STATUS_LABELS[status] ?? status}
        </span>
    );
}

export function DifficultyBadge({ difficulty, className = '' }: { difficulty: string; className?: string }) {
    const s = DIFFICULTY_STYLES[difficulty] ?? DIFFICULTY_STYLES.medium;
    const Icon = s.icon;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-difficulty={difficulty}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {DIFFICULTY_LABELS[difficulty as keyof typeof DIFFICULTY_LABELS] ?? difficulty}
        </span>
    );
}

export function SeverityBadge({ severity, className = '' }: { severity: string; className?: string }) {
    return <span className={`${chip} ${SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.medium} ${className}`}>{SEVERITY_LABELS[severity as keyof typeof SEVERITY_LABELS] ?? severity} severity</span>;
}

export function PublishedBadge({ published }: { published: boolean }) {
    const Icon = published ? Globe : FileEdit;
    return (
        <span className={`${chip} ${published ? 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300' : 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300'}`} data-published={published ? 'true' : 'false'}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {published ? 'Published' : 'Draft'}
        </span>
    );
}

export function CategoryChip({ category }: { category: string }) {
    return <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{categoryLabel(category)}</span>;
}

export function LanguageChip({ language }: { language: string }) {
    return <span className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>{languageLabel(language)}</span>;
}
