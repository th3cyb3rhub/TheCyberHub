import { CheckCircle2, Circle, PlayCircle, SignalHigh, SignalLow, SignalMedium, FileEdit, Archive, Globe } from 'lucide-react';
import { chip } from '@/components/events/styles';
import { DIFFICULTY_LABELS, LAB_STATUS_LABELS, VIEWER_STATUS_LABELS } from '@/lib/labs/display';
import type { LabDifficulty, LabStatus, LabViewerStatus } from '@/types/lab';

type Style = { className: string; icon: React.ElementType };

/** Colour never carries the meaning alone: every badge has an icon and a word */
const VIEWER_STYLES: Record<LabViewerStatus, Style> = {
    'not-started': { className: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300', icon: Circle },
    'in-progress': { className: 'bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300', icon: PlayCircle },
    completed: { className: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300', icon: CheckCircle2 },
};

const DIFFICULTY_STYLES: Record<LabDifficulty, Style> = {
    easy: { className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300', icon: SignalLow },
    medium: { className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', icon: SignalMedium },
    hard: { className: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300', icon: SignalHigh },
};

const LAB_STATUS_STYLES: Record<LabStatus, Style> = {
    draft: { className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', icon: FileEdit },
    published: { className: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300', icon: Globe },
    archived: { className: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300', icon: Archive },
};

export function ViewerStatusBadge({ status, className = '' }: { status: LabViewerStatus; className?: string }) {
    const s = VIEWER_STYLES[status] ?? VIEWER_STYLES['not-started'];
    const Icon = s.icon;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-status={status}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {VIEWER_STATUS_LABELS[status] ?? status}
        </span>
    );
}

export function DifficultyBadge({ difficulty, className = '' }: { difficulty: LabDifficulty; className?: string }) {
    const s = DIFFICULTY_STYLES[difficulty] ?? DIFFICULTY_STYLES.easy;
    const Icon = s.icon;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-difficulty={difficulty}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {DIFFICULTY_LABELS[difficulty] ?? difficulty}
        </span>
    );
}

export function LabStatusBadge({ status, className = '' }: { status: LabStatus; className?: string }) {
    const s = LAB_STATUS_STYLES[status] ?? LAB_STATUS_STYLES.draft;
    const Icon = s.icon;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-status={status}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {LAB_STATUS_LABELS[status] ?? status}
        </span>
    );
}
