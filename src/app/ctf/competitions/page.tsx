import type { Metadata } from 'next';
import Link from 'next/link';
import { Flag, Trophy } from 'lucide-react';
import { btnSecondary, muted, pageBg, pageWrap } from '@/components/events/styles';
import { CompetitionsExplorer } from '@/components/ctf/CompetitionsExplorer';
import { CTF_LIMITS } from '@/lib/ctf/constants';
import { fetchCompetitionsPage } from '@/lib/ctf/server';
import { CTF_LIST_FILTERS, type CtfListFilter } from '@/types/ctf';

export const metadata: Metadata = {
    title: 'CTF Competitions',
    description: 'Timed capture the flag competitions you can play solo or in a team. See what is live, what is coming and how past ones ended.',
    alternates: { canonical: '/ctf/competitions' },
    openGraph: {
        title: 'CTF Competitions | TheCyberHub',
        description: 'Timed capture the flag competitions: solo or in teams, with a live scoreboard and final results.',
        type: 'website',
    },
};

const parseFilter = (value: string | string[] | undefined): CtfListFilter => {
    const v = Array.isArray(value) ? value[0] : value;
    return CTF_LIST_FILTERS.find((f) => f === v) ?? 'all';
};

export default async function CompetitionsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
    const filter = parseFilter((await searchParams).status);
    // Fail-soft: a slow or failing API gives null, and the browser asks again
    const page = await fetchCompetitionsPage(filter, 1, CTF_LIMITS.pageDefault);
    // When this copy was built: the browser treats it as that old, not as new
    const builtAt = Date.now();
    return (
        <div className={pageBg}>
            <div className={pageWrap}>
                <header className="mb-8">
                    <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-orange-800 dark:text-orange-400">
                        <Trophy className="h-4 w-4" aria-hidden="true" /> Timed events
                    </p>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">CTF Competitions</h1>
                    <p className={`mt-2 max-w-2xl text-sm ${muted}`}>
                        Play a set of challenges against the clock, alone or with a team. The scoreboard moves as flags are solved, and the results are published when the competition ends.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Link href="/ctf" className={btnSecondary}><Flag className="h-4 w-4" aria-hidden="true" /> Practice challenges</Link>
                        <Link href="/ctf/leaderboard" className={btnSecondary}><Trophy className="h-4 w-4" aria-hidden="true" /> Global leaderboard</Link>
                    </div>
                </header>
                <CompetitionsExplorer key={filter} filter={filter} initialPage={page} initialUpdatedAt={builtAt} />
            </div>
        </div>
    );
}
