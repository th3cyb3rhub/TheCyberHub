import Image from 'next/image';
import Link from 'next/link';
import { safeHref } from '@/lib/ctf/display';

/** A round avatar or the first letter of the name. Decorative: the name is always next to it. */
export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
    const url = safeHref(src);
    return (
        <span
            className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-xs font-bold text-gray-800 dark:bg-white/10 dark:text-gray-300"
            style={{ width: size, height: size }}
            aria-hidden="true"
        >
            {url ? <Image src={url} alt="" width={size} height={size} className="h-full w-full object-cover" unoptimized /> : (name.charAt(0) || '?').toUpperCase()}
        </span>
    );
}

/** A player as the boards show them: avatar and username, linked to the profile */
export function Username({ username, avatar, you = false }: { username: string; avatar?: string | null; you?: boolean }) {
    return (
        <span className="flex min-w-0 items-center gap-2.5">
            <Avatar name={username} src={avatar} />
            <Link href={`/user/${encodeURIComponent(username)}`} className="min-w-0 truncate text-sm font-medium text-gray-900 hover:text-orange-700 dark:text-white dark:hover:text-orange-400">
                {username}
            </Link>
            {you && <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900 dark:bg-orange-500/20 dark:text-orange-200">You</span>}
        </span>
    );
}
