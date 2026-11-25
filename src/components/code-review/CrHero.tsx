import { ShieldAlert } from 'lucide-react';
import { muted } from '@/components/events/styles';

/** The page title and what an exercise is. Static, so the server renders it. */
export function CrHero() {
    return (
        <header className="mb-8">
            <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-orange-800 dark:text-orange-400">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Secure code review
            </p>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">Code Review</h1>
            <p className={`mt-2 max-w-2xl text-sm ${muted}`}>
                Read a piece of vulnerable code and mark the lines you think are wrong. The server grades your marks, explains what you found and pays points
                for your first pass. Hints cost points, and the solution opens after your first attempt.
            </p>
        </header>
    );
}
