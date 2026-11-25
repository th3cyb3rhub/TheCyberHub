/**
 * The state of the thin bar at the top of the page that shows a navigation is under way. Next 15 has no
 * router events, so a click on an internal link starts it and the new address finishes it. It is kept
 * apart from React so its timing can be tested with fake timers.
 */
export type ProgressPhase = 'idle' | 'running' | 'finishing';

export interface ProgressOptions {
    /** Navigations that finish sooner than this never show the bar (no flicker on a cached page) */
    delayMs?: number;
    /** A navigation that never finishes (cancelled, stuck, a click that went nowhere) lets go after this */
    maxMs?: number;
    /** How long the bar takes to complete and fade */
    finishMs?: number;
    onChange: (phase: ProgressPhase) => void;
}

export interface Progress {
    start: () => void;
    finish: () => void;
    destroy: () => void;
}

export function createProgress({ delayMs = 120, maxMs = 10_000, finishMs = 300, onChange }: ProgressOptions): Progress {
    let phase: ProgressPhase = 'idle';
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    let maxTimer: ReturnType<typeof setTimeout> | undefined;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    let destroyed = false;

    const set = (next: ProgressPhase) => {
        if (destroyed || next === phase) return;
        phase = next;
        onChange(next);
    };
    const clearAll = () => {
        clearTimeout(delayTimer);
        clearTimeout(maxTimer);
        clearTimeout(finishTimer);
        delayTimer = maxTimer = finishTimer = undefined;
    };

    const finish = () => {
        if (delayTimer) {
            // It ended before the bar was ever shown
            clearTimeout(delayTimer);
            delayTimer = undefined;
            return;
        }
        if (phase !== 'running') return;
        clearTimeout(maxTimer);
        maxTimer = undefined;
        set('finishing');
        finishTimer = setTimeout(() => { finishTimer = undefined; set('idle'); }, finishMs);
    };

    return {
        start() {
            if (destroyed || phase === 'running' || delayTimer) return;
            clearTimeout(finishTimer);
            finishTimer = undefined;
            delayTimer = setTimeout(() => {
                delayTimer = undefined;
                set('running');
                maxTimer = setTimeout(finish, maxMs);
            }, delayMs);
        },
        finish,
        destroy() {
            destroyed = true;
            clearAll();
        },
    };
}

/** The part of a click the decision needs (a MouseEvent has it all; a test can pass a plain object) */
export interface ClickLike {
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    target: EventTarget | null;
}

/**
 * Whether a click starts an in-app navigation: the primary button, no modifier (those open a tab or a
 * window), on a link to another address of this site that opens in this tab and is not a download.
 * A link to the same page, or only to another hash on it, does not. A link can opt out with `data-no-progress`.
 */
export function isTrackedNavigation(event: ClickLike, location: Pick<Location, 'href' | 'origin' | 'pathname' | 'search'>): boolean {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    const target = event.target as Element | null;
    const anchor = target && typeof target.closest === 'function' ? target.closest('a[href]') as HTMLAnchorElement | null : null;
    if (!anchor || anchor.hasAttribute('download') || anchor.hasAttribute('data-no-progress')) return false;
    if (anchor.target && anchor.target !== '_self') return false;
    let url: URL;
    try {
        url = new URL(anchor.getAttribute('href') ?? '', location.href);
    } catch {
        return false;
    }
    if (url.origin !== location.origin) return false;
    return url.pathname !== location.pathname || url.search !== location.search;
}

/** Other code that starts a navigation without a link (a `router.push`) can announce it with this */
export const NAVIGATION_START_EVENT = 'tch:navigation-start';
export function announceNavigationStart(): void {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
}
