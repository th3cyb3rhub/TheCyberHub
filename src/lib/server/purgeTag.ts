import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';

const BEARER = /^Bearer\s+[\w.~+/=-]{10,4096}$/;

/**
 * Drops the cached public copies carrying `tag`, so a change an administrator just saved shows up
 * for visitors at once instead of after the cache runs out. The caller proves who they are with
 * their own token, which the API confirms: only an administrator or an owner can purge, because a
 * purge makes the server fetch everything again. Shared by every `/api/revalidate/*` route.
 */
export async function purgeTagForStaff(request: Request, tag: string): Promise<NextResponse> {
    const authorization = request.headers.get('authorization') ?? '';
    if (!BEARER.test(authorization)) return NextResponse.json({ revalidated: false }, { status: 401 });

    let role: unknown;
    try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: authorization },
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return NextResponse.json({ revalidated: false }, { status: res.status === 401 ? 401 : 502 });
        role = (await res.json())?.data?.role;
    } catch {
        return NextResponse.json({ revalidated: false }, { status: 502 });
    }
    if (role !== 'admin' && role !== 'owner') return NextResponse.json({ revalidated: false }, { status: 403 });

    revalidateTag(tag);
    return NextResponse.json({ revalidated: true });
}
