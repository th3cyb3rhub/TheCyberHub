'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Bookmark, Briefcase, ChevronDown, Loader2, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { btnPrimary, btnSecondary, focusRing, input, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { hitSortCap, useJobs } from '@/hooks/queries/useJobs';
import { useDebounce } from '@/hooks/useDebounce';
import { CATEGORY_OPTIONS, EMPLOYMENT_OPTIONS, EXPERIENCE_OPTIONS, JOB_LIMITS, LOCATION_OPTIONS, SORT_OPTIONS } from '@/lib/jobs/constants';
import { isReviewerOnly } from '@/lib/jobs/roles';
import { jobFiltersToSearch, jobsApiQuery, parseJobFilters } from '@/lib/jobs/query';
import {
    EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, JOB_CATEGORIES, JOB_SORTS, LOCATION_TYPES, type JobCard as Card, type JobListFilters, type JobsPage, type JobSort,
} from '@/types/job';
import { JobCard } from './JobCard';
import { ErrorState, ListSkeleton } from './ListStates';
import { SaveJobButton } from './SaveJobButton';

const pick = <T extends string>(list: readonly T[], value: string): T | undefined => (list as readonly string[]).includes(value) ? (value as T) : undefined;
const whole = (value: string): number | undefined => (/^\d{1,9}$/.test(value) && Number(value) <= JOB_LIMITS.salaryMax ? Number(value) : undefined);

const selectClass = `${input} cursor-pointer`;

function FilterSelect({ id, label, value, onChange, options, all }: {
    id: string; label: string; value: string; onChange: (v: string) => void; options: { id: string; name: string }[]; all: string;
}) {
    return (
        <div>
            <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
            <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
                <option value="">{all}</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
        </div>
    );
}

interface Props {
    /** What the address said when the page was rendered on the server */
    initialFilters: JobListFilters;
    /** The first page rendered on the server for those filters, when the API answered */
    initialPage: (JobsPage<Card> & { fetchedAt?: number }) | null;
}

const queryOf = (filters: JobListFilters) => jobFiltersToSearch(filters).toString();

/**
 * The job list with its filters. The address is the state: it changes as the filters do (without a
 * navigation, so the server is not asked again for every key typed), and a link with filters in it
 * opens the same list. A signed-in member also sees which jobs they saved, with a save button.
 *
 * The list starts from the address the browser has now (`useSearchParams`), not from what the server
 * rendered: coming back from a job with Back shows the page the server rendered earlier, but the
 * address already holds the filters the member had set, and the list must follow the address.
 */
export function JobsExplorer({ initialFilters, initialPage }: Props) {
    const params = useSearchParams();
    const fromAddress = useMemo(() => (params ? parseJobFilters(params) : initialFilters), [params, initialFilters]);
    const key = queryOf(fromAddress);
    const [start, setStart] = useState({ epoch: 0, filters: fromAddress });
    // What this list wrote into the address, so only a change it did not make (Back, Forward, a link) restarts it
    const lastWritten = useRef(key);
    const inFlight = useRef(new Set<string>());
    useEffect(() => {
        if (key === lastWritten.current) { inFlight.current.clear(); return; }
        if (inFlight.current.delete(key)) return;
        lastWritten.current = key;
        setStart((s) => ({ epoch: s.epoch + 1, filters: fromAddress }));
    }, [key, fromAddress]);
    const wrote = useCallback((qs: string) => { lastWritten.current = qs; inFlight.current.add(qs); }, []);
    return <Explorer key={start.epoch} start={start.filters} serverFilters={initialFilters} initialPage={initialPage} onWrite={wrote} />;
}

function Explorer({ start: initialFilters, serverFilters, initialPage, onWrite }: {
    start: JobListFilters; serverFilters: JobListFilters; initialPage: Props['initialPage']; onWrite: (qs: string) => void;
}) {
    const { user } = useAuth();
    const id = useId();
    const [search, setSearch] = useState(initialFilters.search ?? '');
    const [category, setCategory] = useState<string>(initialFilters.category ?? '');
    const [level, setLevel] = useState<string>(initialFilters.experienceLevel ?? '');
    const [where, setWhere] = useState<string>(initialFilters.locationType ?? '');
    const [type, setType] = useState<string>(initialFilters.employmentType ?? '');
    const [sort, setSort] = useState<string>(initialFilters.sortBy ?? 'createdAt');
    const [salaryMin, setSalaryMin] = useState(initialFilters.salaryMin !== undefined ? String(initialFilters.salaryMin) : '');
    const [salaryMax, setSalaryMax] = useState(initialFilters.salaryMax !== undefined ? String(initialFilters.salaryMax) : '');
    const [featured, setFeatured] = useState(!!initialFilters.featured);
    const [open, setOpen] = useState(false);
    const dSearch = useDebounce(search.trim(), 350);
    const dMin = useDebounce(salaryMin, 500);
    const dMax = useDebounce(salaryMax, 500);

    const filters = useMemo<JobListFilters>(() => {
        const next: JobListFilters = {};
        if (dSearch) next.search = dSearch.slice(0, JOB_LIMITS.searchMax);
        const c = pick(JOB_CATEGORIES, category); if (c) next.category = c;
        const l = pick(EXPERIENCE_LEVELS, level); if (l) next.experienceLevel = l;
        const w = pick(LOCATION_TYPES, where); if (w) next.locationType = w;
        const t = pick(EMPLOYMENT_TYPES, type); if (t) next.employmentType = t;
        const min = whole(dMin); if (min !== undefined) next.salaryMin = min;
        const max = whole(dMax); if (max !== undefined) next.salaryMax = max;
        if (featured) next.featured = true;
        const s = pick(JOB_SORTS as readonly JobSort[], sort);
        if (s && s !== 'createdAt') { next.sortBy = s; next.sortOrder = SORT_OPTIONS.find((o) => o.id === s)?.order ?? 'desc'; }
        return next;
    }, [dSearch, category, level, where, type, dMin, dMax, featured, sort]);

    // The server page is for the filters of the address it rendered; any other set asks the API
    const seed = jobsApiQuery(filters) === jobsApiQuery(serverFilters) ? initialPage : null;
    const query = useJobs(filters, seed, initialPage?.fetchedAt);

    // The address follows the filters, without a navigation
    const first = useRef(true);
    useEffect(() => {
        if (first.current) { first.current = false; return; }
        const qs = queryOf(filters);
        onWrite(qs);
        // `null` state: Next adds its own bookkeeping to it and tells `useSearchParams` and the router about the new
        // address. Passing the current state back would skip that, and Back would then show the wrong list.
        try { window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`); } catch { /* the address stays as it was */ }
    }, [filters, onWrite]);

    const items = useMemo(() => {
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((j) => !seen.has(j._id) && !!seen.add(j._id));
    }, [query.data]);
    const saved = useMemo(() => new Set(query.data?.pages.flatMap((p) => p.viewer?.savedIds ?? []) ?? []), [query.data]);
    const total = query.data?.pages[0]?.pagination.total ?? null;
    const active = [category, level, where, type, salaryMin, salaryMax].filter(Boolean).length + (featured ? 1 : 0) + (sort !== 'createdAt' ? 1 : 0);
    const dirty = active > 0 || search !== '';

    const capped = hitSortCap(filters, query.data?.pages);

    const clear = () => {
        setSearch(''); setCategory(''); setLevel(''); setWhere(''); setType(''); setSort('createdAt'); setSalaryMin(''); setSalaryMax(''); setFeatured(false);
    };

    return (
        <div>
            <form role="search" aria-label="Search jobs" onSubmit={(e) => e.preventDefault()} className="mb-6 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-[min(100%,16rem)] flex-1">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                        <input type="search" aria-label="Search jobs, companies or skills" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={JOB_LIMITS.searchMax}
                            placeholder="Search jobs, companies or skills" className={`${input} pl-11`} />
                    </div>
                    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={`${id}-filters`} className={`${btnSecondary} lg:hidden`}>
                        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters{active > 0 && <span className="rounded-full bg-orange-700 px-1.5 text-xs text-white">{active}</span>}
                        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                </div>
                <div id={`${id}-filters`} className={`${open ? 'grid' : 'hidden'} grid-cols-1 gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-4`}>
                    <FilterSelect id={`${id}-cat`} label="Category" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} all="All categories" />
                    <FilterSelect id={`${id}-lvl`} label="Experience" value={level} onChange={setLevel} options={EXPERIENCE_OPTIONS} all="All levels" />
                    <FilterSelect id={`${id}-loc`} label="Location" value={where} onChange={setWhere} options={LOCATION_OPTIONS} all="Anywhere" />
                    <FilterSelect id={`${id}-type`} label="Employment" value={type} onChange={setType} options={EMPLOYMENT_OPTIONS} all="All types" />
                    <div>
                        <label htmlFor={`${id}-min`} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Pay from</label>
                        <input id={`${id}-min`} type="number" inputMode="numeric" min={0} max={JOB_LIMITS.salaryMax} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} placeholder="Lowest pay" className={input} />
                    </div>
                    <div>
                        <label htmlFor={`${id}-max`} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Pay up to</label>
                        <input id={`${id}-max`} type="number" inputMode="numeric" min={0} max={JOB_LIMITS.salaryMax} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} placeholder="Highest pay" className={input} />
                    </div>
                    <FilterSelect id={`${id}-sort`} label="Sort by" value={sort === 'createdAt' ? '' : sort} onChange={(v) => setSort(v || 'createdAt')} options={SORT_OPTIONS.filter((o) => o.id !== 'createdAt').map((o) => ({ id: o.id, name: o.name }))} all="Newest" />
                    <div className="flex items-end">
                        <label className="flex h-[42px] cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-4 w-4 accent-orange-600" /> Featured only
                        </label>
                    </div>
                </div>
            </form>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className={`text-sm ${muted}`} aria-live="polite" data-testid="jobs-count">
                    {total === null ? '' : total > items.length ? `Showing ${items.length} of ${total} jobs` : `${total} ${total === 1 ? 'job' : 'jobs'}`}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    {dirty && <button type="button" onClick={clear} className={`${btnSecondary} !px-3 !py-2`}><X className="h-4 w-4" aria-hidden="true" /> Clear filters</button>}
                    {user && <Link href="/jobs/saved" className={`${btnSecondary} !px-3 !py-2`}><Bookmark className="h-4 w-4" aria-hidden="true" /> Saved jobs</Link>}
                    {!isReviewerOnly(user?.role) && <Link href="/employer/post" className={`${btnPrimary} !px-3 !py-2`}><Plus className="h-4 w-4" aria-hidden="true" /> Post a job</Link>}
                </div>
            </div>

            {query.isLoading ? (
                <ListSkeleton />
            ) : query.isError && items.length === 0 ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load jobs" />
            ) : items.length === 0 ? (
                <EmptyState icon={Briefcase} title="No jobs found" description={dirty ? 'Try fewer filters or a different search.' : 'New jobs are reviewed before they appear. Check back soon.'}
                    actionLabel={dirty ? 'Clear filters' : undefined} onAction={dirty ? clear : undefined} />
            ) : (
                <div aria-busy={query.isPlaceholderData || undefined}>
                    <ul className={`space-y-4 ${query.isPlaceholderData ? 'opacity-60' : ''}`} aria-label="Jobs" data-testid="jobs-list">
                        {items.map((job) => (
                            <li key={job._id}>
                                <JobCard job={job} saveSlot={user ? <SaveJobButton id={job._id} title={job.title} saved={saved.has(job._id)} pending={query.isPlaceholderData} variant="icon" /> : undefined} />
                            </li>
                        ))}
                    </ul>
                    {query.isError && (
                        <p role="alert" className="mt-4 text-center text-sm text-red-800 dark:text-red-300">Could not load more jobs. <button type="button" className={`underline ${focusRing}`} onClick={() => void query.fetchNextPage()}>Try again</button></p>
                    )}
                    {capped && (
                        <p className={`mt-8 text-center text-sm ${muted}`} data-testid="sort-cap">
                            Showing the first {items.length} jobs for this sort. Narrow the filters or sort by newest to see the rest.
                            <button type="button" className={`ml-1 underline ${focusRing}`} onClick={() => setSort('createdAt')}>Sort by newest</button>
                        </p>
                    )}
                    {query.hasNextPage && (
                        <div className="mt-8 text-center">
                            <button type="button" className={btnSecondary} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                                {query.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
