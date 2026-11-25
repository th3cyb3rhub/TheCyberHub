'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Award, Calendar, Snowflake, Star, Swords, Trophy, Users } from 'lucide-react';
import { card, muted, pageBg } from '@/components/events/styles';
import { TabBar } from '@/components/events/TabBar';
import { btnSecondary } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { refreshCompetition, useCtfClockSync, useCtfCompetition, useCtfMe } from '@/hooks/queries/useCtf';
import { ApiError } from '@/lib/api';
import { participantsText, safeHref } from '@/lib/ctf/display';
import { isCtfReader } from '@/lib/ctf/roles';
import { useCtfStatus } from '@/lib/ctf/clock';
import type { CtfCompetition, CtfStatus } from '@/types/ctf';
import { Banners } from './Banners';
import { CtfStatusBadge, Pill } from './Badges';
import { CompetitionClock, CompetitionTimes } from './CompetitionTimes';
import { CtfMarkdown } from './CtfMarkdown';
import { ErrorState, ListSkeleton } from './ListStates';
import { RegisterPanel } from './RegisterPanel';

// The panels are split from the shell: a visitor who only reads the header does not load the flag
// forms, the board or the markdown renderer first. They still render on the server.
const panelLoading = () => <ListSkeleton count={2} label="Loading" />;
const ChallengesPanel = dynamic(() => import('./ChallengesPanel'), { loading: panelLoading });
const ScoreboardPanel = dynamic(() => import('./ScoreboardPanel'), { loading: panelLoading });
const TeamPanel = dynamic(() => import('./TeamPanel'), { loading: panelLoading });
const RulesPanel = dynamic(() => import('./RulesPanel'), { loading: panelLoading });

export const TAB_IDS = ['challenges', 'scoreboard', 'team', 'rules'] as const;
export type TabId = (typeof TAB_IDS)[number];

/** A tab from the address, or the first one. Team is only for team competitions. */
export function parseTab(value: string | null | undefined, teamsEnabled: boolean): TabId {
    const tab = TAB_IDS.find((t) => t === value);
    if (!tab || (tab === 'team' && !teamsEnabled)) return 'challenges';
    return tab;
}

function Shell({ children }: { children: React.ReactNode }) {
    return <div className={pageBg}><div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">{children}</div></div>;
}

function Description({ text }: { text: string }) {
    const [open, setOpen] = useState(false);
    const long = text.length > 420;
    return (
        <div data-testid="description">
            <div className={long && !open ? 'relative max-h-28 overflow-hidden' : undefined}>
                <CtfMarkdown content={text} />
                {long && !open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent dark:from-neutral-900" aria-hidden="true" />}
            </div>
            {long && (
                <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 text-sm font-medium text-orange-800 underline dark:text-orange-300">
                    {open ? 'Show less' : 'Show more'}
                </button>
            )}
        </div>
    );
}

function Header({ competition, status, signedIn, me }: { competition: CtfCompetition; status: CtfStatus; signedIn: boolean; me: ReturnType<typeof useCtfMe>['data'] }) {
    const image = safeHref(competition.image);
    return (
        <section className={`${card} overflow-hidden`} aria-labelledby="comp-title">
            {image && (
                <div className="relative h-36 w-full bg-gray-100 sm:h-48 dark:bg-neutral-800">
                    <Image src={image} alt="" fill sizes="(min-width: 1152px) 1152px, 100vw" className="object-cover" unoptimized priority />
                </div>
            )}
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <CtfStatusBadge status={status} />
                        {competition.isFeatured && <Pill icon={Star}>Featured</Pill>}
                        <Pill icon={competition.teamsEnabled ? Users : Swords}>{competition.teamsEnabled ? `Teams of ${competition.minTeamSize > 1 ? `${competition.minTeamSize} to ` : 'up to '}${competition.maxTeamSize}` : 'Solo'}</Pill>
                        <Pill icon={Trophy}>{competition.scoringMode === 'dynamic' ? 'Dynamic scoring' : 'Static scoring'}</Pill>
                        {competition.awardsPoints && <Pill icon={Award}>Counts for the global board</Pill>}
                    </div>
                    <h1 id="comp-title" className="break-words text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">{competition.title}</h1>
                    {competition.shortDescription && <p className="mt-2 text-base text-gray-800 dark:text-gray-200">{competition.shortDescription}</p>}
                    {competition.description.trim() && <div className="mt-4"><Description text={competition.description} /></div>}
                </div>
                <aside className="space-y-4 border-t border-gray-100 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 dark:border-neutral-800" aria-label="Competition facts">
                    <CompetitionClock competition={{ ...competition, status }} />
                    <CompetitionTimes competition={{ ...competition, status }} />
                    <p className={`flex items-center gap-2 text-sm ${muted}`}><Calendar className="h-4 w-4" aria-hidden="true" />{competition.challengeCount} {competition.challengeCount === 1 ? 'challenge' : 'challenges'} {'·'} {participantsText(competition)}</p>
                    {status === 'frozen' && <p className="flex items-center gap-2 text-sm text-cyan-900 dark:text-cyan-300"><Snowflake className="h-4 w-4" aria-hidden="true" /> Scoreboard frozen</p>}
                    <RegisterPanel competition={competition} status={status} me={me} signedIn={signedIn} />
                </aside>
            </div>
        </section>
    );
}

interface Props {
    slug: string;
    initialCompetition: CtfCompetition | null;
    initialUpdatedAt?: number;
    initialTab?: string;
}

/**
 * One competition. The server renders the public copy; a signed-in member's own answer replaces it
 * (staff see drafts and more). The header, the banners and the tab bar are the shell; the four
 * panels load next to it.
 */
/** What a competition that is not there (or not published, for this viewer) says */
export function CompetitionMissingBody() {
    return (
        <>
            <Trophy className="mx-auto mb-4 h-10 w-10 text-gray-500" aria-hidden="true" />
            <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">This competition is not available</h1>
            <p className={`mb-6 text-sm ${muted}`}>It may have been removed, or it is not published yet.</p>
            <Link href="/ctf/competitions" className={btnSecondary}>All competitions</Link>
        </>
    );
}

/** The page for an address that cannot be a competition */
export function CompetitionMissing() {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-2xl px-4 pb-16 pt-28 text-center sm:px-6"><CompetitionMissingBody /></div>
        </div>
    );
}

export function CompetitionView({ slug, initialCompetition, initialUpdatedAt, initialTab }: Props) {
    const { user, loading } = useAuth();
    const qc = useQueryClient();
    const query = useCtfCompetition(slug, initialCompetition, initialUpdatedAt);
    const competition = query.data;
    const signedIn = !!user;
    const staff = isCtfReader(user?.role);
    const me = useCtfMe(slug, signedIn && !!competition);

    const [tab, setTab] = useState<TabId>(() => parseTab(initialTab, true));
    const teamsEnabled = competition?.teamsEnabled ?? false;
    const activeTab: TabId = tab === 'team' && !teamsEnabled ? 'challenges' : tab;

    const choose = useCallback((id: string) => {
        const next = parseTab(id, true);
        setTab(next);
        try {
            const url = new URL(window.location.href);
            if (next === 'challenges') url.searchParams.delete('tab'); else url.searchParams.set('tab', next);
            window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
        } catch { /* the address stays as it was */ }
    }, []);

    // Re-renders this page only when the status changes (start, freeze, end), not on every tick
    const status = useCtfStatus(competition);
    // One read of the board puts the countdown and the status on the server's clock
    useCtfClockSync(slug, !!competition && (status === 'upcoming' || status === 'live' || status === 'frozen'));

    // The clock moved the competition on (it started, froze or ended): everything that depends on it is read again
    const previous = useRef(status);
    useEffect(() => {
        if (previous.current !== status) {
            previous.current = status;
            refreshCompetition(qc, slug);
        }
    }, [status, slug, qc]);

    if (!competition) {
        if (loading || query.isLoading || query.isPending) {
            return (
                <Shell>
                    <div className="space-y-4" role="status" aria-label="Loading competition">
                        <div className="h-6 w-32 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                        <div className={`${card} h-64 animate-pulse`} />
                        <div className={`${card} h-72 animate-pulse`} />
                    </div>
                </Shell>
            );
        }
        const missing = query.error instanceof ApiError && query.error.status === 404;
        return (
            <div className={pageBg}>
                <div className="mx-auto max-w-2xl px-4 pb-16 pt-28 text-center sm:px-6">
                    {missing ? (
                        <CompetitionMissingBody />
                    ) : (
                        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load this competition" />
                    )}
                </div>
            </div>
        );
    }

    const tabs = [
        { id: 'challenges', label: 'Challenges', count: competition.challengeCount },
        { id: 'scoreboard', label: 'Scoreboard' },
        ...(teamsEnabled ? [{ id: 'team', label: 'Team' }] : []),
        { id: 'rules', label: 'Rules' },
    ];
    const goTeam = () => choose('team');

    return (
        <Shell>
            <Link href="/ctf/competitions" className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-gray-400 dark:hover:text-white">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All competitions
            </Link>
            <Header competition={competition} status={status} signedIn={signedIn} me={me.data} />
            <div className="mt-5"><Banners competition={competition} status={status} signedIn={signedIn} me={me.data} staff={staff} onTeamTab={goTeam} /></div>

            <div className="mt-6">
                <TabBar label="Competition sections" idPrefix="ctf-tab" active={activeTab} onChange={choose} tabs={tabs} />
            </div>
            <div id="ctf-tab-panel" role="tabpanel" aria-labelledby={`ctf-tab-${activeTab}`} className="mt-5" tabIndex={-1}>
                {activeTab === 'challenges' && <ChallengesPanel competition={competition} status={status} signedIn={signedIn} me={me.data} staff={staff} onTeamTab={goTeam} />}
                {activeTab === 'scoreboard' && <ScoreboardPanel competition={competition} status={status} signedIn={signedIn} />}
                {activeTab === 'team' && <TeamPanel competition={competition} status={status} signedIn={signedIn} />}
                {activeTab === 'rules' && <RulesPanel competition={competition} />}
            </div>
        </Shell>
    );
}
