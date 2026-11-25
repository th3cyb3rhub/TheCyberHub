/**
 * The colour theme, in one place for the provider and for the script that runs before the first paint.
 *
 * Contract (the same for the script and for `applyTheme`): the `<html>` element carries the class
 * `dark` or `light`; a light theme also sets `data-theme="light"`, a dark one has no `data-theme`.
 * The choice is stored under `tch-theme`; without a stored choice the system preference decides, and
 * a browser that cannot tell (or blocks storage) gets dark.
 */

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'tch-theme';

/** What the server renders and what the first client render must match */
export const DEFAULT_THEME: Theme = 'dark';

export const isTheme = (value: unknown): value is Theme => value === 'dark' || value === 'light';

/** The stored choice, or null when there is none, it is not a theme, or storage is blocked */
export function readStoredTheme(): Theme | null {
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        return isTheme(stored) ? stored : null;
    } catch {
        return null;
    }
}

export function systemTheme(): Theme {
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
        return DEFAULT_THEME;
    }
}

/** The stored choice, else the system preference */
export const resolveTheme = (): Theme => readStoredTheme() ?? systemTheme();

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
    if (theme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
        root.removeAttribute('data-theme');
    } else {
        root.classList.remove('dark');
        root.classList.add('light');
        root.setAttribute('data-theme', 'light');
    }
}

/** The theme the page is showing right now, read from `<html>` */
export const currentTheme = (root: HTMLElement = document.documentElement): Theme => (root.classList.contains('light') ? 'light' : 'dark');

/**
 * The script the root layout puts in `<head>`, so the theme is on `<html>` before the first paint
 * and a light theme never flashes dark. It is plain ES5 inside a try, and any failure leaves the dark
 * default. It is inline, like the framework's own bootstrap, and covered by the policy's existing
 * script allowance; it never reads the page or sends anything.
 */
export const themeInitScript = `(function(){var d=document.documentElement,t=null;try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');if(s==='dark'||s==='light')t=s}catch(e){}try{if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}if(t!=='light')t='dark';d.classList.remove(t==='dark'?'light':'dark');d.classList.add(t);if(t==='light')d.setAttribute('data-theme','light');else d.removeAttribute('data-theme')})();`;
