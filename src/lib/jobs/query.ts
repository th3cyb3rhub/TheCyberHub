import { JOB_LIMITS } from './constants';
import {
    EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, JOB_CATEGORIES, JOB_SORTS, LOCATION_TYPES,
    type JobListFilters, type JobSort,
} from '@/types/job';

const isIn = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);

type Input = URLSearchParams | Record<string, string | string[] | undefined>;

const read = (input: Input, key: string): string | undefined => {
    if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
    const value = input[key];
    return Array.isArray(value) ? value[0] : value;
};

const amount = (value: string | undefined): number | undefined => {
    if (!value || !/^\d{1,9}$/.test(value)) return undefined;
    const n = Number(value);
    return n <= JOB_LIMITS.salaryMax ? n : undefined;
};

/** What the address says about the list. A value the API would refuse is dropped, never sent. */
export function parseJobFilters(input: Input): JobListFilters {
    const filters: JobListFilters = {};
    const search = read(input, 'search')?.trim().slice(0, JOB_LIMITS.searchMax);
    if (search) filters.search = search;
    const category = read(input, 'category');
    if (isIn(JOB_CATEGORIES, category)) filters.category = category;
    // The old list page called this `experience`
    const level = read(input, 'experienceLevel') ?? read(input, 'experience');
    if (isIn(EXPERIENCE_LEVELS, level)) filters.experienceLevel = level;
    const where = read(input, 'locationType');
    if (isIn(LOCATION_TYPES, where)) filters.locationType = where;
    const type = read(input, 'employmentType');
    if (isIn(EMPLOYMENT_TYPES, type)) filters.employmentType = type;
    const min = amount(read(input, 'salaryMin'));
    if (min !== undefined) filters.salaryMin = min;
    const max = amount(read(input, 'salaryMax'));
    if (max !== undefined) filters.salaryMax = max;
    if (read(input, 'featured') === '1' || read(input, 'featured') === 'true') filters.featured = true;
    const sort = read(input, 'sort');
    if (isIn(JOB_SORTS, sort) && sort !== 'createdAt') {
        filters.sortBy = sort;
        filters.sortOrder = sort === 'title' ? 'asc' : 'desc';
    }
    return filters;
}

/** The address query for a set of filters: the same names `parseJobFilters` reads, nothing for a default */
export function jobFiltersToSearch(filters: JobListFilters): URLSearchParams {
    const qs = new URLSearchParams();
    if (filters.search) qs.set('search', filters.search);
    if (filters.category) qs.set('category', filters.category);
    if (filters.experienceLevel) qs.set('experienceLevel', filters.experienceLevel);
    if (filters.locationType) qs.set('locationType', filters.locationType);
    if (filters.employmentType) qs.set('employmentType', filters.employmentType);
    if (filters.salaryMin !== undefined) qs.set('salaryMin', String(filters.salaryMin));
    if (filters.salaryMax !== undefined) qs.set('salaryMax', String(filters.salaryMax));
    if (filters.featured) qs.set('featured', '1');
    if (filters.sortBy && filters.sortBy !== 'createdAt') qs.set('sort', filters.sortBy);
    return qs;
}

/** The query string of the API for a list request (`?a=b`, or empty). Empty values and page 1 are left out. */
export function jobsApiQuery(filters: JobListFilters = {}): string {
    const qs = new URLSearchParams();
    const set = (key: string, value: string | number | boolean | undefined | null) => {
        if (value === undefined || value === null || value === '' || value === false) return;
        qs.set(key, String(value));
    };
    set('page', filters.page && filters.page > 1 ? filters.page : undefined);
    set('limit', filters.limit);
    set('search', filters.search?.trim());
    set('category', filters.category);
    set('experienceLevel', filters.experienceLevel);
    set('locationType', filters.locationType);
    set('employmentType', filters.employmentType);
    set('featured', filters.featured);
    set('salaryMin', filters.salaryMin);
    set('salaryMax', filters.salaryMax);
    if (filters.sortBy && (filters.sortBy !== 'createdAt' || filters.sortOrder === 'asc')) {
        qs.set('sortBy', filters.sortBy as JobSort);
        if (filters.sortOrder) qs.set('sortOrder', filters.sortOrder);
    }
    const s = qs.toString();
    return s ? `?${s}` : '';
}

/** Whether the filters narrow the list at all */
export const hasJobFilters = (filters: JobListFilters): boolean => jobFiltersToSearch(filters).size > 0;
