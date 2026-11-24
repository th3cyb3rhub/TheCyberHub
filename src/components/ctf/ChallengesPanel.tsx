'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ExternalLink, FileDown, Flag, Lock, Search, Users } from 'lucide-react';
import { card, cardPad, focusRing, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useCtfChallenges } from '@/hooks/queries/useCtf';
import { LINK_REL } from '@/lib/ctf/constants';
import { categoryLabel, difficultyLabel, formatBytes, pointsView, safeHref } from '@/lib/ctf/display';
import { isPlayable } from '@/lib/ctf/status';
import { ctfErrorCode } from '@/lib/ctf/errors';
import type { CtfChallenge, CtfCompetition, CtfMe, CtfStatus } from '@/types/ctf';
import { CtfDifficultyBadge } from './Badges';
import { CtfFlagForm, type TeamIssue } from './CtfFlagForm';
import { CtfMarkdown } from './CtfMarkdown';
import { CompetitionTimes } from './CompetitionTimes';
import { ErrorState, ListSkeleton } from './ListStates';

const chipButton = (active: boolean) => `rounded-full border px-3 py-1 text-sm font-medium transition-colors ${focusRing} ${active
    ? 'border-orange-700 bg-orange-700 text-white'
    : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`;

interface PanelProps {
    competition: CtfCompetition;
    status: CtfStatus;
    signedIn: boolean;
    me: CtfMe | null | undefined;
    staff: boolean;
    onTeamTab: () => void;
}

/** The team problem the client can see before it asks the server: no team, or too few members */
export function teamIssueFor(competition: Pick<CtfCompetition, 'teamsEnabled' | 'minTeamSize'>, me: CtfMe | null | undefined): TeamIssue | null {
    if (!competition.teamsEnabled || !me) return null;
    if (!me.team) return { reason: 'team-required', message: 'This competition is played in teams. Create a team or join one with an invite code, then send your flag.' };
    if (me.team.members.length < competition.minTeamSize) {
        const n = me.team.members.length;
        return { reason: 'team-too-small', message: `Your team has ${n} ${n === 1 ? 'member' : 'members'}. It needs at least ${competition.minTeamSize} to send flags. Invite more players with your invite code.` };
    }
    return null;
}

function ChallengeRow({ challenge, open, onToggle, competition, status, signedIn, teamIssue, onTeamTab }: {
    challenge: CtfChallenge;
    open: boolean;
    onToggle: () => void;
    competition: CtfCompetition;
    status: CtfStatus;
    signedIn: boolean;
    teamIssue: TeamIssue | null;
    onTeamTab: () => void;
}) {
    const points = pointsView(challenge, competition.scoringMode);
    const panelId = `challenge-${challenge._id}`;
    const instance = signedIn ? safeHref(challenge.instanceUrl) : null;
    const files = challenge.files.map((f) => ({ ...f, href: safeHref(f.url) })).filter((f): f is typeof f & { href: string } => !!f.href);
    return (
        <li className={`${card} overflow-hidden`} data-testid="challenge" data-solved={challenge.solved} data-id={challenge._id}>
            <h3>
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={onToggle}
                    className={`flex w-full items-start gap-3 p-4 text-left sm:items-center sm:gap-4 ${focusRing}`}
                >
                    <span className="mt-0.5 shrink-0 sm:mt-0" aria-hidden="true">
                        {challenge.solved
                            ? <CheckCircle2 className="h-6 w-6 text-green-700 dark:text-green-400" />
                            : <span className="block h-6 w-6 rounded-full border-2 border-gray-300 dark:border-neutral-600" />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block break-words text-base font-semibold text-gray-900 dark:text-white">
                            {challenge.title}
                            {challenge.solved && <span className="ml-2 align-middle text-xs font-semibold text-green-800 dark:text-green-300">Solved</span>}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className={`text-xs ${muted}`}>{categoryLabel(challenge.category)}</span>
                            <CtfDifficultyBadge difficulty={challenge.difficulty} />
                            <span className={`text-xs ${muted}`}>{challenge.solveCount} {challenge.solveCount === 1 ? 'solve' : 'solves'}</span>
                        </span>
                    </span>
                    <span className="shrink-0 text-right" data-testid="challenge-points">
                        <span className="block text-base font-bold tabular-nums text-gray-900 dark:text-white">{points.now}</span>
                        {points.base && <span className={`block text-xs ${muted}`}>{points.base}</span>}
                    </span>
                    <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-gray-500 transition-transform sm:mt-0 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
            </h3>
            {open && (
                <div id={panelId} className="space-y-4 border-t border-gray-100 p-4 dark:border-neutral-800">
                    {challenge.description?.trim()
                        ? <CtfMarkdown content={challenge.description} />
                        : challenge.shortDescription ? <p className="text-sm text-gray-800 dark:text-gray-200">{challenge.shortDescription}</p> : <p className={`text-sm ${muted}`}>No description.</p>}

                    {challenge.tags.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                            {challenge.tags.slice(0, 8).map((t) => <li key={t} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-neutral-800 dark:text-gray-300">{t}</li>)}
                        </ul>
                    )}

                    {files.length > 0 && (
                        <div>
                            <h4 className="mb-1.5 text-sm font-semibold text-gray-900 dark:text-white">Files</h4>
                            <ul className="space-y-1.5">
                                {files.map((f) => (
                                    <li key={f.href}>
                                        <a href={f.href} target="_blank" rel={LINK_REL} className={`inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-900 hover:bg-gray-50 dark:border-neutral-700 dark:text-gray-100 dark:hover:bg-neutral-800 ${focusRing}`}>
                                            <FileDown className="h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                                            <span className="truncate">{f.filename}</span>
                                            {formatBytes(f.size) && <span className={`shrink-0 text-xs ${muted}`}>{formatBytes(f.size)}</span>}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {instance && (
                        <p className="text-sm">
                            <a href={instance} target="_blank" rel={LINK_REL} className={`inline-flex items-center gap-2 rounded font-medium text-orange-800 underline dark:text-orange-300 ${focusRing}`}>
                                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open the target
                            </a>
                            <span className={`ml-2 text-xs ${muted}`}>Use only this target. It is shared.</span>
                        </p>
                    )}

                    <CtfFlagForm slug={competition.slug} challenge={challenge} status={status} signedIn={signedIn} teamIssue={teamIssue} onTeamTab={onTeamTab} />
                </div>
            )}
        </li>
    );
}

/** The challenges of a running or finished competition, with filters, solved ticks and a flag form each */
export function ChallengesPanel({ competition, status, signedIn, me, staff, onTeamTab }: PanelProps) {
    const started = isPlayable(status) || status === 'ended';
    const query = useCtfChallenges(competition.slug, started || staff);
    const [category, setCategory] = useState('');
    const [difficulty, setDifficulty] = useState('');
    const [unsolved, setUnsolved] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);

    const challenges = useMemo(() => query.data ?? [], [query.data]);
    const categories = useMemo(() => Array.from(new Set(challenges.map((c) => c.category))).sort(), [challenges]);
    const difficulties = useMemo(() => Array.from(new Set(challenges.map((c) => c.difficulty))), [challenges]);
    const shown = challenges.filter((c) => (!category || c.category === category) && (!difficulty || c.difficulty === difficulty) && (!unsolved || !c.solved));
    const solvedCount = challenges.filter((c) => c.solved).length;
    const earned = me?.points ?? null;
    const teamIssue = teamIssueFor(competition, me);

    if (!started && !staff) {
        return (
            <div className={cardPad} data-testid="challenges-locked">
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <Lock className="h-8 w-8 text-gray-500" aria-hidden="true" />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{status === 'cancelled' ? 'This competition was cancelled' : 'The challenges open when the competition starts'}</h2>
                    {status === 'upcoming' && <div className="text-left"><CompetitionTimes competition={competition} /></div>}
                    {status === 'upcoming' && competition.teamsEnabled && signedIn && me && !me.team && (
                        <button type="button" onClick={onTeamTab} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:text-gray-100 dark:hover:bg-neutral-800">
                            <Users className="h-4 w-4" aria-hidden="true" /> Get your team ready
                        </button>
                    )}
                    {status === 'upcoming' && !signedIn && (
                        <Link href={`/auth?redirect=${encodeURIComponent(`/ctf/competitions/${competition.slug}`)}`} className="text-sm font-medium text-orange-800 underline dark:text-orange-300">Sign in to register</Link>
                    )}
                </div>
            </div>
        );
    }

    if (query.isLoading) return <ListSkeleton count={3} label="Loading challenges" />;
    if (query.isError) {
        const code = ctfErrorCode(query.error);
        if (code === 'CTF_NOT_STARTED') {
            return <EmptyState icon={Lock} title="The challenges open when the competition starts" description="Come back at the start time." />;
        }
        return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load the challenges" />;
    }
    if (challenges.length === 0) {
        return <EmptyState icon={Flag} title="No challenges yet" description="The organisers have not added any challenge to this competition." />;
    }

    return (
        <div data-testid="challenges-panel">
            {!started && staff && (
                <p role="note" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    Staff preview: players cannot see these challenges until the competition starts.
                </p>
            )}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-800 dark:text-gray-200" aria-live="polite" data-testid="progress">
                    <strong>{solvedCount}</strong> of {challenges.length} solved
                    {earned !== null && signedIn && <> {'·'} <strong>{earned}</strong> {earned === 1 ? 'point' : 'points'}{competition.teamsEnabled && me?.team ? ' for your team' : ''}</>}
                </p>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                    <input type="checkbox" checked={unsolved} onChange={(e) => setUnsolved(e.target.checked)} className="h-4 w-4 rounded border-gray-400 text-orange-700 focus:ring-orange-500" />
                    Unsolved only
                </label>
            </div>

            <div className="mb-5 space-y-3" role="search" aria-label="Filter challenges">
                <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
                    <button type="button" aria-pressed={!category} onClick={() => setCategory('')} className={chipButton(!category)}>All categories</button>
                    {categories.map((c) => <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={chipButton(category === c)}>{categoryLabel(c)}</button>)}
                </div>
                {difficulties.length > 1 && (
                    <div role="group" aria-label="Difficulty" className="flex flex-wrap gap-2">
                        <button type="button" aria-pressed={!difficulty} onClick={() => setDifficulty('')} className={chipButton(!difficulty)}>All levels</button>
                        {difficulties.map((d) => <button key={d} type="button" aria-pressed={difficulty === d} onClick={() => setDifficulty(d)} className={chipButton(difficulty === d)}>{difficultyLabel(d)}</button>)}
                    </div>
                )}
            </div>

            {shown.length === 0 ? (
                <p className={`${cardPad} text-center text-sm ${muted}`} data-testid="no-match">
                    <Search className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
                    {unsolved && !category && !difficulty ? 'Everything is solved. Nice work.' : 'No challenge matches these filters.'}
                </p>
            ) : (
                <ul className="space-y-3" aria-label="Challenges">
                    {shown.map((c) => (
                        <ChallengeRow
                            key={c._id}
                            challenge={c}
                            open={openId === c._id}
                            onToggle={() => setOpenId((id) => (id === c._id ? null : c._id))}
                            competition={competition}
                            status={status}
                            signedIn={signedIn}
                            teamIssue={teamIssue}
                            onTeamTab={onTeamTab}
                        />
                    ))}
                </ul>
            )}
            
        </div>
    );
}

export default ChallengesPanel;
