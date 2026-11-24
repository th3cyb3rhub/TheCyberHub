import { EXPERTISE_AREAS } from './display';
import type { ExpertiseArea, MentorListFilters } from '@/types/mentorship';

export const SORTS = [
    { value: 'relevance', label: 'Best match' },
    { value: 'rating', label: 'Highest rated' },
    { value: 'experience', label: 'Most experienced' },
] as const;

export const MIN_RATINGS = [
    { value: 0, label: 'Any rating' },
    { value: 3, label: '3 stars and up' },
    { value: 4, label: '4 stars and up' },
    { value: 4.5, label: '4.5 stars and up' },
] as const;

type Params = { get(name: string): string | null };

/** The directory filters a URL holds. Unknown values are ignored, so a hand-edited link never breaks the page. */
export function filtersFromParams(params: Params): MentorListFilters {
    const filters: MentorListFilters = {};
    const expertise = (params.get('expertise') ?? '').split(',').map((s) => s.trim())
        .filter((s): s is ExpertiseArea => (EXPERTISE_AREAS as readonly string[]).includes(s));
    if (expertise.length) filters.expertise = Array.from(new Set(expertise));
    const rating = Number(params.get('minRating'));
    if (Number.isFinite(rating) && rating > 0 && rating <= 5) filters.minRating = rating;
    if (params.get('hasCapacity') === 'false') filters.hasCapacity = false;
    const sort = params.get('sort');
    if (sort === 'rating' || sort === 'experience') filters.sort = sort;
    const search = params.get('search')?.trim();
    if (search) filters.search = search.slice(0, 100);
    return filters;
}

/** The query string for the page URL (defaults left out) */
export function filtersToParams(filters: MentorListFilters): string {
    const params = new URLSearchParams();
    if (filters.expertise?.length) params.set('expertise', filters.expertise.join(','));
    if (filters.minRating) params.set('minRating', String(filters.minRating));
    if (filters.hasCapacity === false) params.set('hasCapacity', 'false');
    if (filters.sort && filters.sort !== 'relevance') params.set('sort', filters.sort);
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

export const hasActiveFilters = (filters: MentorListFilters) =>
    !!(filters.expertise?.length || filters.minRating || filters.hasCapacity === false || filters.search?.trim() || (filters.sort && filters.sort !== 'relevance'));
