'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createProgress, isTrackedNavigation, NAVIGATION_START_EVENT, type Progress, type ProgressPhase } from '@/lib/navigationProgress';

/**
 * A thin bar fixed at the top of the screen while a link to another page of the app is loading. The
 * pages no longer have a route level skeleton (see ARCHITECTURE.md), so this is the feedback that a
 * click was heard. It takes no space (fixed), is hidden from assistive technology, and with a
 * reduced motion setting it appears whole without moving.
 */
const BAR: Record<ProgressPhase, string> = {
    idle: 'opacity-0 scale-x-0 duration-0',
    running: 'opacity-100 scale-x-[0.85] duration-[8000ms] ease-out motion-reduce:scale-x-100 motion-reduce:duration-0',
    finishing: 'opacity-0 scale-x-100 duration-300 ease-out motion-reduce:duration-0',
};

export function NavigationProgress() {
    const pathname = usePathname();
    const search = useSearchParams().toString();
    const [phase, setPhase] = useState<ProgressPhase>('idle');
    const progress = useRef<Progress | null>(null);

    useEffect(() => {
        const controller = createProgress({ onChange: setPhase });
        progress.current = controller;
        const onClick = (event: MouseEvent) => { if (isTrackedNavigation(event, window.location)) controller.start(); };
        const onAnnounce = () => controller.start();
        document.addEventListener('click', onClick);
        window.addEventListener(NAVIGATION_START_EVENT, onAnnounce);
        return () => {
            document.removeEventListener('click', onClick);
            window.removeEventListener(NAVIGATION_START_EVENT, onAnnounce);
            controller.destroy();
            progress.current = null;
        };
    }, []);

    // The new address is the end of the navigation
    useEffect(() => { progress.current?.finish(); }, [pathname, search]);

    return (
        <div aria-hidden="true" data-testid="navigation-progress" data-phase={phase} className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden">
            <div className={`h-full w-full origin-left bg-orange-500 transition-[transform,opacity] ${BAR[phase]}`} />
        </div>
    );
}
