import { purgeTagForStaff } from '@/lib/server/purgeTag';
import { CODE_REVIEW_CACHE_TAG } from '@/lib/codeReview/constants';

// Never cached: every call checks the caller again
export const dynamic = 'force-dynamic';

/** Drops the cached public copies of the exercise list and every exercise page */
export async function POST(request: Request) {
    return purgeTagForStaff(request, CODE_REVIEW_CACHE_TAG);
}
