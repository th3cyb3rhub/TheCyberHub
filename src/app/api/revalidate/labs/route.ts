import { purgeTagForStaff } from '@/lib/server/purgeTag';

// Never cached: every call checks the caller again
export const dynamic = 'force-dynamic';

/** Drops the cached public copies of the labs list, the filters and every lab page */
export async function POST(request: Request) {
    return purgeTagForStaff(request, 'labs');
}
