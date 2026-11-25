import { CR_CATEGORIES, CR_DIFFICULTIES, CR_LANGUAGES, CR_VIEWER_STATUSES, type CrFilters, type CrViewerStatus } from '@/types/codeReview';
import { CR_LIMITS, SORT_CHOICES, isIn } from './constants';

/** The API takes a search of any length up to 100; one letter matches too much to be useful */
export const SEARCH_MIN = 2;
export const SEARCH_MAX = CR_LIMITS.search;
export const SEARCH_DEBOUNCE_MS = 300;
export const DEFAULT_SORT = 'newest';
const SORT_IDS = SORT_CHOICES.map((s) => s.id);

/** What the address holds: every value is already checked, anything else is dropped */
export interface UrlFilters {
    category: string;
    difficulty: string;
    language: string;
    status: CrViewerStatus | '';
    q: string;
    sort: string;
}

export const emptyFilters = (): UrlFilters => ({ category: '', difficulty: '', language: '', status: '', q: '', sort: DEFAULT_SORT });

export function filtersFromParams(params: URLSearchParams): UrlFilters {
    // The API refuses a value outside its lists, so an address with an old or made-up one (`?category=sqli` from the first release) is "no filter", not an error
    const category = params.get('category');
    const language = params.get('language');
    const difficulty = params.get('difficulty');
    const status = params.get('status');
    const sort = params.get('sort');
    return {
        category: isIn(CR_CATEGORIES, category) ? category : '',
        difficulty: isIn(CR_DIFFICULTIES, difficulty) ? difficulty : '',
        language: isIn(CR_LANGUAGES, language) ? language : '',
        status: isIn(CR_VIEWER_STATUSES, status) ? status : '',
        q: (params.get('q') ?? '').slice(0, SEARCH_MAX),
        sort: sort && SORT_IDS.includes(sort) ? sort : DEFAULT_SORT,
    };
}

/** A search the API gets: trimmed, spaces collapsed, at least two characters. Shorter text is not sent. */
export function effectiveQuery(q: string): string {
    const text = q.trim().replace(/\s+/g, ' ');
    return text.length >= SEARCH_MIN ? text : '';
}

/**
 * The filters of the API call. `status` is the member's own state, so it is sent only when signed
 * in (the API ignores it otherwise, and the list would look filtered when it is not).
 */
export function apiFilters(url: UrlFilters, signedIn: boolean): CrFilters {
    const sort = SORT_CHOICES.find((s) => s.id === url.sort) ?? SORT_CHOICES[0];
    return {
        category: url.category || undefined,
        difficulty: url.difficulty || undefined,
        language: url.language || undefined,
        status: signedIn ? url.status : '',
        search: effectiveQuery(url.q) || undefined,
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
    };
}

/** Whether the filters are the plain list the server renders: nothing narrowed, newest first */
export function isDefaultList(url: UrlFilters, signedIn: boolean): boolean {
    const f = apiFilters(url, signedIn);
    return !f.category && !f.difficulty && !f.language && !f.status && !f.search && url.sort === DEFAULT_SORT;
}

export function hasActiveFilters(url: UrlFilters, signedIn: boolean): boolean {
    return !isDefaultList(url, signedIn) || url.q.trim().length > 0;
}

/** The address query for a set of changes. Empty values and defaults are left out. */
export function paramsWithChanges(current: URLSearchParams, changes: Partial<Record<keyof UrlFilters, string | null>>): string {
    const params = new URLSearchParams(current.toString());
    for (const [key, value] of Object.entries(changes)) {
        const drop = value === null || value === undefined || value === '' || (key === 'sort' && value === DEFAULT_SORT);
        if (drop) params.delete(key); else params.set(key, value);
    }
    return params.toString();
}
