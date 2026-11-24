import { JOBS_CACHE_TAG } from '@/lib/jobs/constants';
import { purgeTagForStaff } from '@/lib/server/purgeTag';

// Never cached: every call checks the caller again
export const dynamic = 'force-dynamic';

/** Drops the cached public copies of the jobs list, the job pages and the company pages */
export async function POST(request: Request) {
    return purgeTagForStaff(request, JOBS_CACHE_TAG);
}
