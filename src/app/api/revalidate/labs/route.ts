import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';

// Never cached: every call checks the caller again
export const dynamic = 'force-dynamic';

const BEARER = /^Bearer\s+[\w.~+/=-]{10,4096}$/;

/**
 * Drops the cached public copies of the labs list, the filters and every lab page, so a change an
 * administrator just saved shows up for visitors at once instead of after the cache runs out.
 * The caller proves who they are with their own token, which the API confirms: only an
 * administrator or an owner can purge, because a purge makes the server fetch everything again.
 */
export async function POST(request: Request) {
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

    revalidateTag('labs');
    return NextResponse.json({ revalidated: true });
}
