'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_THEME, THEME_STORAGE_KEY, applyTheme, currentTheme, isTheme, resolveTheme, type Theme } from '@/lib/theme';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// `<html>` is the one source of truth: the script in the root layout sets it before the first paint,
// `applyTheme` changes it, and this store only tells React when it did.
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};
const notify = () => listeners.forEach((listener) => listener());
const getSnapshot = (): Theme => currentTheme();
// The server has no `<html>` class to read and always renders the default; the first client render
// uses the same value, then React re-renders with the real one without a hydration mismatch.
const getServerSnapshot = (): Theme => DEFAULT_THEME;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    // After mount: make sure `<html>` shows the stored (or system) theme even when the inline script
    // did not run, and follow the choice made in another tab.
    useEffect(() => {
        applyTheme(resolveTheme());
        notify();
        const onStorage = (e: StorageEvent) => {
            if (e.key === THEME_STORAGE_KEY && isTheme(e.newValue)) {
                applyTheme(e.newValue);
                notify();
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const setTheme = useCallback((next: Theme) => {
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            // Storage may be unavailable (private browsing, blocked site data): the choice still holds for this visit
        }
        applyTheme(next);
        notify();
    }, []);

    const toggleTheme = useCallback(() => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'), [setTheme]);

    const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
