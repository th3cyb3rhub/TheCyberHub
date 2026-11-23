'use client';

import { useRef } from 'react';
import { focusRing } from './styles';

export interface TabItem { id: string; label: string; count?: number }

/** Tabs with the keyboard pattern: arrows move between them, Home and End jump */
export function TabBar({ tabs, active, onChange, label, idPrefix = 'tab' }: {
    tabs: TabItem[];
    active: string;
    onChange: (id: string) => void;
    label: string;
    idPrefix?: string;
}) {
    const refs = useRef<Record<string, HTMLButtonElement | null>>({});

    const onKeyDown = (e: React.KeyboardEvent, index: number) => {
        let next = -1;
        if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next >= 0) {
            e.preventDefault();
            const id = tabs[next].id;
            onChange(id);
            refs.current[id]?.focus();
        }
    };

    return (
        <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900/60">
            {tabs.map((t, i) => {
                const selected = t.id === active;
                return (
                    <button
                        key={t.id}
                        ref={(el) => { refs.current[t.id] = el; }}
                        id={`${idPrefix}-${t.id}`}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-controls={`${idPrefix}-panel`}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(t.id)}
                        onKeyDown={(e) => onKeyDown(e, i)}
                        className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${focusRing} ${selected
                            ? 'bg-orange-700 text-white'
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-neutral-800'}`}
                    >
                        {t.label}
                        {typeof t.count === 'number' && t.count > 0 && (
                            <span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${selected ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-800 dark:bg-neutral-700 dark:text-gray-200'}`}>{t.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
