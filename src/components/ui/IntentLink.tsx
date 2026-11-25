'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, type ComponentProps } from 'react';

/** The app router, or null where there is none (a unit test renders a card on its own) */
function useOptionalRouter() {
    try {
        return useRouter();
    } catch {
        return null;
    }
}

/**
 * A link that loads its page in full only when the visitor shows intent: the pointer rests on it, it gets
 * focus, or a finger touches it. A list of cards would otherwise prefetch every detail page it shows, and
 * the detail pages are rendered by the server for each prefetch. Once is enough; the click does the rest.
 */
export function IntentLink({ href, onMouseEnter, onFocus, onTouchStart, ...rest }: ComponentProps<typeof Link>) {
    const router = useOptionalRouter();
    const warmed = useRef(false);
    const warm = () => {
        if (warmed.current || !router || typeof href !== 'string' || !href.startsWith('/')) return;
        warmed.current = true;
        try { router.prefetch(href); } catch { /* a failed prefetch only costs the speed up */ }
    };
    return (
        <Link
            href={href}
            {...rest}
            prefetch={false}
            onMouseEnter={(e) => { warm(); onMouseEnter?.(e); }}
            onFocus={(e) => { warm(); onFocus?.(e); }}
            onTouchStart={(e) => { warm(); onTouchStart?.(e); }}
        />
    );
}
