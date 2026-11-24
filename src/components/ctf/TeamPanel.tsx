'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, Crown, Loader2, LogOut, UserMinus, UserPlus, Users } from 'lucide-react';
import { CopyField } from '@/components/events/CopyField';
import { btnDanger, btnPrimary, btnSecondary, card, cardPad, input, inputError, label, muted } from '@/components/events/styles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useCreateCtfTeam, useCtfMe, useCtfTeam, useJoinCtfTeam, useKickCtfMember, useLeaveCtfTeam } from '@/hooks/queries/useCtf';
import { CAPTAIN_LEAVE_MESSAGE, ctfErrorMessage } from '@/lib/ctf/errors';
import { inviteCodeSchema, teamNameSchema } from '@/lib/ctf/schemas';
import { JOIN_BLOCK_TEXT, joinBlock, normaliseInvite, ROSTER_LOCKED_TEXT, seatsLeft, teamPermissions, teamTooSmall } from '@/lib/ctf/team';
import { scoreText } from '@/lib/ctf/display';
import type { CtfCompetition, CtfStatus, CtfTeam, CtfTeamMember } from '@/types/ctf';
import { Avatar } from './Person';
import { ErrorState, ListSkeleton } from './ListStates';

function CreateTeamForm({ slug, disabled, minTeamSize, maxTeamSize }: { slug: string; disabled: boolean; minTeamSize: number; maxTeamSize: number }) {
    const create = useCreateCtfTeam();
    const { addToast } = useToast();
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (create.isPending) return;
        const parsed = teamNameSchema.safeParse(name);
        if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Enter a team name'); return; }
        setError(null);
        create.mutate({ slug, name: parsed.data }, {
            onSuccess: () => { setName(''); addToast({ variant: 'success', message: 'Team created. Share your invite code with your players.' }); },
            onError: (err) => setError(ctfErrorMessage(err)),
        });
    };

    return (
        <form onSubmit={onSubmit} noValidate className={cardPad} data-testid="create-team">
            <h3 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">Create a team</h3>
            <p className={`mb-3 text-sm ${muted}`}>You become the captain. Teams have {minTeamSize > 1 ? `${minTeamSize} to ${maxTeamSize}` : `up to ${maxTeamSize}`} members.</p>
            <label htmlFor="team-name" className={label}>Team name</label>
            <input id="team-name" type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} disabled={disabled || create.isPending}
                autoComplete="off" aria-invalid={error ? true : undefined} aria-describedby={error ? 'team-name-error' : undefined} className={`${input} ${error ? inputError : ''}`} />
            <div aria-live="polite">{error && <p id="team-name-error" className="mt-1 text-sm text-red-800 dark:text-red-300">{error}</p>}</div>
            <button type="submit" className={`${btnPrimary} mt-3 w-full sm:w-auto`} disabled={disabled || create.isPending}>
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Users className="h-4 w-4" aria-hidden="true" />} Create team
            </button>
        </form>
    );
}

function JoinTeamForm({ slug, disabled }: { slug: string; disabled: boolean }) {
    const join = useJoinCtfTeam();
    const { addToast } = useToast();
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (join.isPending) return;
        const parsed = inviteCodeSchema.safeParse(normaliseInvite(code));
        if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Enter the invite code'); return; }
        setError(null);
        join.mutate({ slug, inviteCode: parsed.data }, {
            onSuccess: (team) => { setCode(''); addToast({ variant: 'success', message: `You joined ${team.name}.` }); },
            onError: (err) => setError(ctfErrorMessage(err)),
        });
    };

    return (
        <form onSubmit={onSubmit} noValidate className={cardPad} data-testid="join-team">
            <h3 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">Join a team</h3>
            <p className={`mb-3 text-sm ${muted}`}>Ask your captain for the invite code of the team.</p>
            <label htmlFor="invite-code" className={label}>Invite code</label>
            <input id="invite-code" type="text" value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} disabled={disabled || join.isPending}
                autoComplete="off" autoCapitalize="characters" spellCheck={false} data-sentry-mask data-private="true"
                aria-invalid={error ? true : undefined} aria-describedby={error ? 'invite-error' : undefined} className={`${input} font-mono ${error ? inputError : ''}`} />
            <div aria-live="polite">{error && <p id="invite-error" className="mt-1 text-sm text-red-800 dark:text-red-300">{error}</p>}</div>
            <button type="submit" className={`${btnSecondary} mt-3 w-full sm:w-auto`} disabled={disabled || join.isPending}>
                {join.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />} Join team
            </button>
        </form>
    );
}

function MemberRow({ member, captain, you, canKick, onKick }: { member: CtfTeamMember; captain: boolean; you: boolean; canKick: boolean; onKick: () => void }) {
    return (
        <li className="flex items-center gap-3 py-2.5" data-testid="team-member" data-username={member.username}>
            <Avatar name={member.username} src={member.avatar} />
            <span className="min-w-0 flex-1">
                <Link href={`/user/${encodeURIComponent(member.username)}`} className="truncate text-sm font-medium text-gray-900 hover:text-orange-700 dark:text-white dark:hover:text-orange-400">{member.username}</Link>
                <span className="ml-2 inline-flex flex-wrap gap-1.5 align-middle">
                    {captain && <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-200"><Crown className="h-3 w-3" aria-hidden="true" /> Captain</span>}
                    {you && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900 dark:bg-orange-500/20 dark:text-orange-200">You</span>}
                </span>
            </span>
            {canKick && (
                <button type="button" onClick={onKick} className={`${btnSecondary} !px-3 !py-1.5 text-xs`} aria-label={`Remove ${member.username}`}>
                    <UserMinus className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                </button>
            )}
        </li>
    );
}

function TeamCard({ competition, status, team }: { competition: CtfCompetition; status: CtfStatus; team: CtfTeam }) {
    const { user } = useAuth();
    const { addToast } = useToast();
    const leave = useLeaveCtfTeam();
    const kick = useKickCtfMember();
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [kicking, setKicking] = useState<CtfTeamMember | null>(null);
    const [error, setError] = useState<string | null>(null);
    const perms = teamPermissions(team, user?.id, status);
    const small = teamTooSmall(team, competition.minTeamSize);
    const left = seatsLeft(team, competition.maxTeamSize);

    const doLeave = () => {
        setConfirmLeave(false);
        setError(null);
        leave.mutate({ slug: competition.slug }, {
            onSuccess: (r) => addToast({ variant: 'info', message: r.disbanded ? 'You left and the team was disbanded.' : 'You left the team.' }),
            onError: (err) => setError(ctfErrorMessage(err)),
        });
    };
    const doKick = () => {
        const member = kicking;
        setKicking(null);
        if (!member) return;
        setError(null);
        kick.mutate({ slug: competition.slug, memberId: member._id }, {
            onSuccess: () => addToast({ variant: 'info', message: `${member.username} was removed from the team.` }),
            onError: (err) => setError(ctfErrorMessage(err)),
        });
    };

    return (
        <section aria-labelledby="team-title" className={`${card} p-5`} data-testid="team-card" data-role={perms.isCaptain ? 'captain' : 'member'}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Your team</p>
                    <h3 id="team-title" className="break-words text-xl font-bold text-gray-900 dark:text-white">{team.name}</h3>
                </div>
                <p className="text-right text-sm text-gray-800 dark:text-gray-200">
                    <strong className="text-lg tabular-nums">{scoreText(team.points)}</strong> {team.points === 1 ? 'point' : 'points'}
                    <span className="block text-xs">{team.solveCount} {team.solveCount === 1 ? 'solve' : 'solves'}</span>
                </p>
            </div>

            {small && (
                <p role="note" className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100" data-testid="team-small">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Your team has {team.members.length} {team.members.length === 1 ? 'member' : 'members'}; it needs at least {competition.minTeamSize} before anybody can send a flag.
                </p>
            )}

            <h4 className="mt-5 text-sm font-semibold text-gray-900 dark:text-white">
                Members ({team.members.length} of {competition.maxTeamSize}{competition.minTeamSize > 1 ? `, at least ${competition.minTeamSize}` : ''})
            </h4>
            <ul className="divide-y divide-gray-100 dark:divide-neutral-800" aria-label="Team members">
                {team.members.map((m) => (
                    <MemberRow key={m._id} member={m} captain={m._id === team.captain._id} you={m._id === user?.id} canKick={perms.canKick(m._id)} onKick={() => setKicking(m)} />
                ))}
            </ul>
            {perms.rosterOpen && (left > 0
                ? <p className={`mt-1 text-xs ${muted}`}>{left} {left === 1 ? 'seat' : 'seats'} left.</p>
                : <p className={`mt-1 text-xs ${muted}`}>The team is full.</p>)}

            {perms.rosterOpen && left > 0 && (
                <div className="mt-5">
                    <CopyField id="team-invite" label="Invite code" value={team.inviteCode} sensitive />
                    <p className={`mt-1 text-xs ${muted}`}>Only the members of the team see this code. Anyone who has it can join while there is room.</p>
                </div>
            )}

            <div aria-live="polite">{error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="team-error">{error}</p>}</div>

            {perms.rosterOpen ? (
                <div className="mt-5 border-t border-gray-100 pt-4 dark:border-neutral-800">
                    {perms.rosterLocked ? (
                        <div data-testid="roster-locked">
                            <button type="button" className={`${btnSecondary} cursor-not-allowed opacity-60`} aria-disabled="true" aria-describedby="roster-locked-note" onClick={(e) => e.preventDefault()}>
                                <LogOut className="h-4 w-4" aria-hidden="true" /> Leave team
                            </button>
                            <p id="roster-locked-note" className={`mt-2 text-xs ${muted}`}>{ROSTER_LOCKED_TEXT}</p>
                        </div>
                    ) : perms.leaveBlocked ? (
                        <div data-testid="leave-blocked">
                            <button type="button" className={`${btnSecondary} cursor-not-allowed opacity-60`} aria-disabled="true" aria-describedby="leave-blocked-note" onClick={(e) => e.preventDefault()}>
                                <LogOut className="h-4 w-4" aria-hidden="true" /> Leave team
                            </button>
                            <p id="leave-blocked-note" className={`mt-2 text-xs ${muted}`}>{CAPTAIN_LEAVE_MESSAGE}</p>
                        </div>
                    ) : (
                        <button type="button" className={btnDanger} onClick={() => setConfirmLeave(true)} disabled={leave.isPending}>
                            {leave.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
                            {perms.leaveDisbands ? 'Leave and disband' : 'Leave team'}
                        </button>
                    )}
                </div>
            ) : (
                <p className={`mt-5 border-t border-gray-100 pt-4 text-sm dark:border-neutral-800 ${muted}`}>The competition is over, so the roster is closed.</p>
            )}

            <ConfirmDialog
                open={confirmLeave}
                variant="danger"
                title={perms.leaveDisbands ? 'Leave and disband this team?' : 'Leave this team?'}
                description={perms.leaveDisbands
                    ? 'You are the only member, so the team ends with you. You can create or join another team afterwards.'
                    : 'You can join another team afterwards. Once your team solves a challenge its roster is fixed until the competition ends.'}
                confirmText={perms.leaveDisbands ? 'Leave and disband' : 'Leave team'}
                onCancel={() => setConfirmLeave(false)}
                onConfirm={doLeave}
            />
            <ConfirmDialog
                open={!!kicking}
                variant="danger"
                title={kicking ? `Remove ${kicking.username}?` : 'Remove this player?'}
                description="They lose their seat and the invite code can bring them back. Once your team solves a challenge its roster is fixed until the competition ends."
                confirmText="Remove player"
                onCancel={() => setKicking(null)}
                onConfirm={doKick}
            />
        </section>
    );
}

/** Create a team, join one with an invite code, see the members, leave or (captain) remove someone */
export function TeamPanel({ competition, status, signedIn }: { competition: CtfCompetition; status: CtfStatus; signedIn: boolean }) {
    const me = useCtfMe(competition.slug, signedIn);
    const team = useCtfTeam(competition.slug, signedIn, me.data ? me.data.team : undefined);

    if (!competition.teamsEnabled) {
        return (
            <div className={cardPad} data-testid="solo-note">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">This competition is played solo</h2>
                <p className={`mt-1 text-sm ${muted}`}>There are no teams: every player scores for themselves. Registering is on the competition page.</p>
            </div>
        );
    }
    if (!signedIn) {
        return (
            <div className={cardPad} data-testid="team-signin">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Teams of {competition.minTeamSize > 1 ? `${competition.minTeamSize} to ${competition.maxTeamSize}` : `up to ${competition.maxTeamSize}`}</h2>
                <p className={`mt-1 mb-4 text-sm ${muted}`}>Sign in to create a team or join one with an invite code.</p>
                <Link href={`/auth?redirect=${encodeURIComponent(`/ctf/competitions/${competition.slug}?tab=team`)}`} className={btnPrimary}>Sign in</Link>
            </div>
        );
    }
    if (team.isLoading && !team.data && team.data !== null) return <ListSkeleton count={2} label="Loading your team" />;
    if (team.isError && team.data === undefined) return <ErrorState error={team.error} onRetry={() => void team.refetch()} title="Could not load your team" />;

    if (team.data) return <TeamCard competition={competition} status={status} team={team.data} />;

    const block = joinBlock(competition, status);
    const disabled = block !== null;
    return (
        <div data-testid="no-team">
            {block && (
                <p role="note" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="join-block">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {JOIN_BLOCK_TEXT[block]}
                </p>
            )}
            <p className={`mb-4 text-sm ${muted}`}>You are not in a team yet. Flags only count for a team, so create one or join one before the competition runs.</p>
            <div className="grid gap-4 md:grid-cols-2">
                <CreateTeamForm slug={competition.slug} disabled={disabled} minTeamSize={competition.minTeamSize} maxTeamSize={competition.maxTeamSize} />
                <JoinTeamForm slug={competition.slug} disabled={disabled} />
            </div>
        </div>
    );
}

export default TeamPanel;
