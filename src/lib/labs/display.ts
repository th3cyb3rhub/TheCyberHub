import type { LabCategory, LabDifficulty, LabStatus, LabViewerStatus } from '@/types/lab';
import { LAB_CATEGORIES, LAB_DIFFICULTIES, LAB_SORTS, LAB_STATUSES, LAB_VIEWER_STATUSES } from '@/types/lab';

export const DIFFICULTY_LABELS: Record<LabDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** What a lab pays when it has no points of its own: mirrors the API's points table */
export const DIFFICULTY_POINTS: Record<LabDifficulty, number> = { easy: 50, medium: 100, hard: 200 };

export const VIEWER_STATUS_LABELS: Record<LabViewerStatus, string> = {
    'not-started': 'Not started',
    'in-progress': 'In progress',
    completed: 'Completed',
};

export const LAB_STATUS_LABELS: Record<LabStatus, string> = { draft: 'Draft', published: 'Published', archived: 'Archived' };

export const SORT_LABELS = { newest: 'Newest', difficulty: 'Easiest first', points: 'Most points', popular: 'Most completed' } as const;

const isIn = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);
export const isLabCategory = (v: unknown): v is LabCategory => isIn(LAB_CATEGORIES, v);
export const isLabDifficulty = (v: unknown): v is LabDifficulty => isIn(LAB_DIFFICULTIES, v);
export const isViewerStatus = (v: unknown): v is LabViewerStatus => isIn(LAB_VIEWER_STATUSES, v);
export const isLabSort = (v: unknown): v is keyof typeof SORT_LABELS => isIn(LAB_SORTS, v);
export const isLabStatus = (v: unknown): v is LabStatus => isIn(LAB_STATUSES, v);

/** `web-security` as "Web security". Unknown categories are still readable. */
export function categoryLabel(category: string): string {
    const text = category.replace(/-/g, ' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/** 45 as "45 min", 90 as "1 h 30 min" */
export function minutesLabel(minutes: number | null | undefined): string | null {
    if (!minutes || minutes < 1) return null;
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}

/** 1536 as "1.5 KB" */
export function formatBytes(bytes: number | null | undefined): string | null {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
    return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[i]}`;
}

/** The first and last characters of a long digest, for a line that must not wrap */
export function shortDigest(digest: string): string {
    return digest.length > 20 ? `${digest.slice(0, 10)}...${digest.slice(-8)}` : digest;
}

/** A link from the API is shown only when it is http or https. Anything else is dropped. */
export function safeHref(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
    } catch {
        return null;
    }
}

/** The host of a link for display, without a path */
export function hostOf(url: string): string {
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

/** Every outbound link of a lab carries these */
export const LINK_REL = 'noopener noreferrer nofollow ugc';

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

/**
 * What a completion pays: the base value minus the penalty of every hint opened, never below zero.
 * The API does the same sum and pays once; this is only for showing it.
 */
export function awardFor(base: number, openedPenalties: readonly number[]): number {
    const taken = openedPenalties.reduce((sum, p) => sum + Math.max(0, p), 0);
    return Math.max(0, base - taken);
}

/** What opening one more hint takes off right now: never more than what is left */
export function hintCost(available: number, penalty: number): number {
    return Math.min(Math.max(0, available), Math.max(0, penalty));
}

/** The points left after opening a hint */
export function pointsAfterHint(available: number, penalty: number): number {
    return Math.max(0, available) - hintCost(available, penalty);
}

/** "1 point" or "50 points" */
export function pointsText(points: number): string {
    return `${points} ${points === 1 ? 'point' : 'points'}`;
}
