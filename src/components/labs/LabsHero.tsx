import { Flag } from 'lucide-react';
import { muted } from '@/components/events/styles';

/** The page title and what a lab is. Static, so the server renders it. */
export function LabsHero() {
    return (
        <header className="mb-8">
            <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-orange-800 dark:text-orange-400">
                <Flag className="h-4 w-4" aria-hidden="true" /> Guided practice
            </p>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">Security Labs</h1>
            <p className={`mt-2 max-w-2xl text-sm ${muted}`}>
                Guided exercises with a flag at the end. Read the brief, work on the target in your own tools, then submit the flag you find.
                Points are paid once, and every hint you open takes some of them off.
            </p>
        </header>
    );
}
