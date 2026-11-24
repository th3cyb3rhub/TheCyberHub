'use client';

import Link from 'next/link';
import { ArrowLeft, Crown, Hourglass, Medal, Snowflake, Trophy, UserCheck } from 'lucide-react';
import { btnPrimary, btnSecondary, card, cardPad, focusRing, muted, pageBg } from '@/components/events/styles';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { useCtfCompetition, useCtfResults } from '@/hooks/queries/useCtf';
import { ApiError } from '@/lib/api';
import { categoryLabel, participantsText, placeLabel, scoreText, sortedPrizes } from '@/lib/ctf/display';
import { entryKey } from '@/lib/ctf/scoreboard';
import { formatRange } from '@/lib/events/time';
import { isTeamEntry, type CtfBoardEntry, type CtfResults } from '@/types/ctf';
import { CtfDifficultyBadge, CtfStatusBadge } from './Badges';
import { BoardTable } from './BoardTable';
import { Avatar } from './Person';
import { ErrorState, ListSkeleton } from './ListStates';

function Shell({ children }: { children: React.ReactNode }) {
    return <div className={pageBg}><div className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6">{children}</div></div>;
}

const medalStyle = (rank: number) =>
    rank === 1 ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-500/40 dark:bg-yellow-500/10'
        : rank === 2 ? 'border-gray-300 bg-gray-50 dark:border-gray-400/30 dark:bg-gray-400/10'
            : 'border-orange-300 bg-orange-50 dark:border-orange-500/30 dark:bg-orange-500/10';

function PodiumCard({ entry, reward }: { entry: CtfBoardEntry; reward?: string }) {
    const team = isTeamEntry(entry);
    const name = team ? entry.teamName : entry.username;
    const avatar = team ? entry.captain?.avatar : entry.avatar;
    return (
        <li
            className={`flex flex-col items-center rounded-2xl border p-5 text-center ${medalStyle(entry.rank)} ${entry.rank === 1 ? 'md:order-2 md:pb-10 md:pt-8' : entry.rank === 2 ? 'md:order-1 md:mt-8' : 'md:order-3 md:mt-12'}`}
            data-testid="podium-place" data-rank={entry.rank}
        >
            {entry.rank === 1 ? <Crown className="mb-2 h-7 w-7 text-yellow-700 dark:text-yellow-300" aria-hidden="true" /> : <Medal className="mb-2 h-6 w-6 text-gray-700 dark:text-gray-300" aria-hidden="true" />}
            <p className="text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-white">{placeLabel(entry.rank)} place</p>
            <div className="my-3"><Avatar name={name} src={avatar} size={56} /></div>
            <p className="max-w-full break-words text-lg font-bold text-gray-900 dark:text-white">
                {team ? name : <Link href={`/user/${encodeURIComponent(name)}`} className={`rounded hover:underline ${focusRing}`}>{name}</Link>}
            </p>
            {team && <p className={`text-xs ${muted}`}>{entry.captain ? `Captain @${entry.captain.username} · ` : ''}{entry.members} {entry.members === 1 ? 'member' : 'members'}</p>}
            <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{scoreText(entry.points)} <span className="text-sm font-medium">pts</span></p>
            <p className={`text-xs ${muted}`}>{entry.solves} {entry.solves === 1 ? 'solve' : 'solves'}</p>
            {reward && <p className="mt-3 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-gray-900 dark:bg-black/30 dark:text-gray-100" data-testid="podium-prize">{reward}</p>}
        </li>
    );
}

/** The results page of an ended competition: podium, top 20, challenges with first bloods, totals */
export function ResultsBody({ results }: { results: CtfResults }) {
    const c = results.competition;
    const prizes = new Map(sortedPrizes(c.prizes).map((p) => [p.place, p.reward]));
    const podium = results.podium.slice(0, 3);
    return (
        <div data-testid="results">
            <header className="mb-8">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <CtfStatusBadge status={c.status} />
                    <span className={`text-sm ${muted}`}>{c.teamsEnabled ? 'Team competition' : 'Solo competition'}</span>
                </div>
                <h1 className="break-words text-3xl font-bold text-gray-900 dark:text-white">{c.title}: final results</h1>
                <p className={`mt-2 text-sm ${muted}`}>{formatRange(c, c.timezone, { withYear: true })}</p>
            </header>

            {results.frozen && (
                <p role="status" className="mb-6 flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100" data-testid="results-frozen">
                    <Snowflake className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span><strong>Frozen standings.</strong> These are the standings as they stood when the board was frozen. Flags sent since still count and may change the final result.</span>
                </p>
            )}

            <dl className="mb-8 grid grid-cols-3 gap-3" data-testid="totals">
                {[
                    { label: results.mode === 'team' ? 'Teams and players' : 'Players', value: results.totals.participants },
                    { label: 'Flags solved', value: results.totals.solves },
                    { label: 'Challenges', value: results.totals.challenges },
                ].map((t) => (
                    <div key={t.label} className={`${card} p-3 text-center sm:p-4`}>
                        <dd className="text-xl font-bold tabular-nums text-gray-900 sm:text-2xl dark:text-white">{scoreText(t.value)}</dd>
                        <dt className={`text-xs ${muted}`}>{t.label}</dt>
                    </div>
                ))}
            </dl>

            <section aria-labelledby="podium-title" className="mb-10">
                <h2 id="podium-title" className="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white"><Trophy className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Podium</h2>
                {podium.length === 0 ? (
                    <p className={`${cardPad} text-center text-sm ${muted}`}>Nobody scored, so there is no podium.</p>
                ) : (
                    <ol className="grid gap-3 md:grid-cols-3 md:items-end" aria-label="Top three">
                        {podium.map((entry) => <PodiumCard key={entryKey(entry)} entry={entry} reward={prizes.get(entry.rank)} />)}
                    </ol>
                )}
            </section>

            <section aria-labelledby="standings-title" className="mb-10">
                <h2 id="standings-title" className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Standings</h2>
                {results.standings.length === 0 ? (
                    <p className={`${cardPad} text-center text-sm ${muted}`}>No standings: nobody scored.</p>
                ) : (
                    <>
                        <BoardTable entries={results.standings} mode={results.mode} caption={`Final standings, top ${results.standings.length}`} />
                        <p className={`mt-2 text-xs ${muted}`}>The top {results.standings.length} are shown. Ties are broken by who reached the total first.</p>
                    </>
                )}
            </section>

            <section aria-labelledby="challenges-title">
                <h2 id="challenges-title" className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Challenges and first bloods</h2>
                {results.challenges.length === 0 ? (
                    <p className={`${cardPad} text-center text-sm ${muted}`}>This competition had no challenges.</p>
                ) : (
                    <div className={`${card} overflow-hidden`}>
                        <table className="w-full table-fixed text-left" data-testid="challenge-table">
                            <caption className="sr-only">Challenges with their solve counts and who solved them first</caption>
                            <thead>
                                <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:border-neutral-800 dark:text-gray-400">
                                    <th scope="col" className="px-3 py-3 sm:px-4">Challenge</th>
                                    <th scope="col" className="w-16 px-2 py-3 text-right sm:w-20 sm:px-4">Solves</th>
                                    <th scope="col" className="w-28 px-3 py-3 sm:w-48 sm:px-4">First blood</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                                {results.challenges.map((ch) => (
                                    <tr key={ch._id} data-testid="result-challenge">
                                        <td className="min-w-0 px-3 py-3 sm:px-4">
                                            <p className="break-words text-sm font-medium text-gray-900 dark:text-white">{ch.title}</p>
                                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                                                {categoryLabel(ch.category)} <CtfDifficultyBadge difficulty={ch.difficulty} /> {ch.basePoints} pts
                                            </p>
                                        </td>
                                        <td className="px-2 py-3 text-right text-sm tabular-nums text-gray-900 sm:px-4 dark:text-white">{ch.solveCount}</td>
                                        <td className="min-w-0 px-3 py-3 text-sm sm:px-4">
                                            {ch.firstBlood ? (
                                                <span className="block min-w-0">
                                                    <span className="flex items-center gap-1 font-medium text-gray-900 dark:text-white"><UserCheck className="h-3.5 w-3.5 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" /> <span className="truncate">{ch.firstBlood.username}</span></span>
                                                    <span className="hidden text-xs text-gray-600 sm:block dark:text-gray-400"><ViewerTime iso={ch.firstBlood.solvedAt} kind="moment" /></span>
                                                </span>
                                            ) : <span className={muted}>Unsolved</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

interface Props { slug: string; initialResults: CtfResults | null; initialUpdatedAt?: number }

/** The results of a competition. Before the end the API answers 409: say so, and say when. */
export function ResultsView({ slug, initialResults, initialUpdatedAt }: Props) {
    const query = useCtfResults(slug, true, initialResults, initialUpdatedAt);
    const competition = useCtfCompetition(slug);
    const back = (
        <Link href={`/ctf/competitions/${slug}`} className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-gray-400 dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the competition
        </Link>
    );

    if (query.data) return <Shell>{back}<ResultsBody results={query.data} /></Shell>;
    if (query.isLoading || query.isPending) return <Shell>{back}<ListSkeleton count={3} label="Loading results" /></Shell>;

    const status = query.error instanceof ApiError ? query.error.status : 0;
    const code = query.error instanceof ApiError ? query.error.code : undefined;
    if (status === 409 || code === 'CTF_RESULTS_NOT_AVAILABLE') {
        const c = competition.data;
        return (
            <Shell>
                {back}
                <div className={`${cardPad} mx-auto max-w-xl text-center`} data-testid="results-not-ready">
                    <Hourglass className="mx-auto mb-3 h-9 w-9 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Results are available when the competition ends</h1>
                    <p className={`mt-2 text-sm ${muted}`}>
                        The podium, the final standings and the first bloods are published at the end.
                        {c ? <> This one ends <ViewerTime iso={c.endDate} kind="moment" />. {participantsText(c)}.</> : null}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                        <Link href={`/ctf/competitions/${slug}?tab=scoreboard`} className={btnPrimary}>Live scoreboard</Link>
                        <Link href="/ctf/competitions" className={btnSecondary}>All competitions</Link>
                    </div>
                </div>
            </Shell>
        );
    }
    if (status === 404) {
        return (
            <Shell>
                <div className="mx-auto max-w-xl py-10 text-center">
                    <Trophy className="mx-auto mb-4 h-10 w-10 text-gray-500" aria-hidden="true" />
                    <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">These results are not available</h1>
                    <p className={`mb-6 text-sm ${muted}`}>The competition may have been removed, or it is not published.</p>
                    <Link href="/ctf/competitions" className={btnSecondary}>All competitions</Link>
                </div>
            </Shell>
        );
    }
    return <Shell>{back}<ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load the results" /></Shell>;
}
