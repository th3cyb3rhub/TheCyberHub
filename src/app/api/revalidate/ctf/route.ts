import { purgeTagForStaff } from '@/lib/server/purgeTag';

// Never cached: every call checks the caller again
export const dynamic = 'force-dynamic';

/** Drops the cached public copies of the competitions list, every competition page and the results */
export async function POST(request: Request) {
    return purgeTagForStaff(request, 'ctf');
}
