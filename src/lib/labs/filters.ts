import type { LabCategory, LabDifficulty, LabFilters, LabSort, LabViewerStatus } from '@/types/lab';
import { isLabCategory, isLabDifficulty, isLabSort, isViewerStatus } from './display';

/** The shortest search the API accepts */
export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;
export const SEARCH_DEBOUNCE_MS = 300;

/** What the address holds: every value is already checked, anything else is dropped */
export interface UrlFilters {
    category: LabCategory | '';
    difficulty: LabDifficulty | '';
    status: LabViewerStatus | '';
    q: string;
    sort: LabSort;
    /** The leaderboard tab */
    tab: 'labs' | 'leaderboard';
}

export const DEFAULT_SORT: LabSort = 'newest';

export function filtersFromParams(params: URLSearchParams): UrlFilters {
    const category = params.get('category');
    const difficulty = params.get('difficulty');
    const status = params.get('status');
    const sort = params.get('sort');
    return {
        category: isLabCategory(category) ? category : '',
        difficulty: isLabDifficulty(difficulty) ? difficulty : '',
        status: isViewerStatus(status) ? status : '',
        q: (params.get('q') ?? '').slice(0, SEARCH_MAX),
        sort: isLabSort(sort) ? sort : DEFAULT_SORT,
        tab: params.get('tab') === 'leaderboard' ? 'leaderboard' : 'labs',
    };
}

/** A search the API accepts: trimmed and at least two characters. Shorter text is not sent. */
export function effectiveQuery(q: string): string {
    const text = q.trim().replace(/\s+/g, ' ');
    return text.length >= SEARCH_MIN ? text : '';
}

/**
 * The filters of the API call. `status` is the member's own state, so it is sent only when signed
 * in (the API ignores it otherwise, and the list would look filtered when it is not).
 */
export function apiFilters(url: UrlFilters, signedIn: boolean): LabFilters {
    return {
        category: url.category,
        difficulty: url.difficulty,
        status: signedIn ? url.status : '',
        q: effectiveQuery(url.q),
        sort: url.sort,
    };
}

/** Whether the filters are the plain list the server renders: nothing narrowed, newest first */
export function isDefaultList(url: UrlFilters, signedIn: boolean): boolean {
    const f = apiFilters(url, signedIn);
    return !f.category && !f.difficulty && !f.status && !f.q && f.sort === DEFAULT_SORT;
}

/** The address query for a set of changes. Empty values and defaults are left out. */
export function paramsWithChanges(current: URLSearchParams, changes: Partial<Record<keyof UrlFilters, string | null>>): string {
    const params = new URLSearchParams(current.toString());
    for (const [key, value] of Object.entries(changes)) {
        const drop = value === null || value === undefined || value === '' || (key === 'sort' && value === DEFAULT_SORT) || (key === 'tab' && value === 'labs');
        if (drop) params.delete(key); else params.set(key, value);
    }
    return params.toString();
}

export function hasActiveFilters(url: UrlFilters, signedIn: boolean): boolean {
    return !isDefaultList(url, signedIn) || (url.q.trim().length > 0);
}
