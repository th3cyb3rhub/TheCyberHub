'use client';

import Link from 'next/link';
import { AlertTriangle, Ban, FileEdit, Info, Snowflake, Trophy, Users } from 'lucide-react';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { btnPrimary, btnSecondary } from '@/components/events/styles';
import type { CtfCompetition, CtfMe, CtfStatus } from '@/types/ctf';

type Tone = 'info' | 'warn' | 'danger' | 'ice' | 'good';

const TONES: Record<Tone, string> = {
    info: 'border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100',
    warn: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    danger: 'border-red-200 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100',
    ice: 'border-cyan-200 bg-cyan-50 text-cyan-950 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100',
    good: 'border-green-200 bg-green-50 text-green-950 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-100',
};

function Banner({ tone, icon: Icon, title, children, action, id }: { tone: Tone; icon: React.ElementType; title: string; children?: React.ReactNode; action?: React.ReactNode; id: string }) {
    return (
        <div className={`flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm ${TONES[tone]}`} data-testid={`banner-${id}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p className="font-semibold">{title}</p>
                {children && <p className="mt-0.5">{children}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

export interface BannerInput {
    competition: CtfCompetition;
    status: CtfStatus;
    signedIn: boolean;
    me: CtfMe | null | undefined;
    staff: boolean;
    onTeamTab: () => void;
}

/**
 * What a visitor or member needs to know before they play: each banner is one fact and, when there
 * is something to do, one button. Several can show at once.
 */
export function Banners({ competition, status, signedIn, me, staff, onTeamTab }: BannerInput) {
    const banners: React.ReactNode[] = [];
    const playable = status === 'live' || status === 'frozen';
    const open = status === 'upcoming' || playable;

    if (status === 'draft') {
        banners.push(<Banner key="draft" id="draft" tone="warn" icon={FileEdit} title="Draft: not published">Only staff can see this competition. Members get a not found page until it is published.</Banner>);
    }
    if (status === 'cancelled') {
        banners.push(<Banner key="cancelled" id="cancelled" tone="danger" icon={Ban} title="This competition was cancelled">Flags are not accepted and the roster is closed. Points already earned stay on the record.</Banner>);
    }
    if (status === 'ended') {
        banners.push(
            <Banner key="ended" id="ended" tone="good" icon={Trophy} title="This competition has ended"
                action={<Link href={`/ctf/competitions/${competition.slug}/results`} className={btnPrimary}>See the results</Link>}>
                Flags are closed. The final standings, the podium and the first bloods are on the results page.
            </Banner>,
        );
    }
    if (status === 'frozen') {
        banners.push(
            <Banner key="frozen" id="frozen" tone="ice" icon={Snowflake} title="The scoreboard is frozen">
                {competition.frozenAt ? <>Since <ViewerTime iso={competition.frozenAt} kind="moment" />. </> : null}
                Flags are still accepted and count, but the public board shows the standings from the moment of the freeze until the end.
                {staff ? ' As staff you see the live board.' : ''}
            </Banner>,
        );
    }

    if (open && !signedIn) {
        banners.push(
            <Banner key="signin" id="signin" tone="info" icon={Info} title="Sign in to take part"
                action={<Link href={`/auth?redirect=${encodeURIComponent(`/ctf/competitions/${competition.slug}`)}`} className={btnPrimary}>Sign in</Link>}>
                You can read everything here without an account. Registering, teams and flags need one.
            </Banner>,
        );
    }

    if (open && signedIn && me) {
        if (competition.teamsEnabled && !me.team) {
            banners.push(
                <Banner key="no-team" id="no-team" tone="warn" icon={Users} title="Teams are enabled: join or create a team"
                    action={<button type="button" onClick={onTeamTab} className={btnSecondary}>Open the team tab</button>}>
                    This competition is played in teams of {competition.minTeamSize > 1 ? `${competition.minTeamSize} to ${competition.maxTeamSize}` : `up to ${competition.maxTeamSize}`}. Flags only count for a team, so you need one before you can send a flag.
                </Banner>,
            );
        } else if (competition.teamsEnabled && me.team && me.team.members.length < competition.minTeamSize) {
            banners.push(
                <Banner key="small" id="team-small" tone="warn" icon={AlertTriangle} title="Your team is too small to send flags"
                    action={<button type="button" onClick={onTeamTab} className={btnSecondary}>Invite players</button>}>
                    {me.team.name} has {me.team.members.length} {me.team.members.length === 1 ? 'member' : 'members'}; this competition needs at least {competition.minTeamSize}.
                </Banner>,
            );
        }
    }
    if (banners.length === 0) return null;
    return <div className="space-y-3" role="region" aria-label="Competition notices">{banners}</div>;
}
