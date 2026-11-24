import type { CtfChallenge, CtfCompetitionCard, CtfPrize, CtfScoringMode } from '@/types/ctf';
import { DECAY_TABLE, DYNAMIC_FLOOR_PERCENT } from './constants';

export { safeHref, hostOf, formatBytes, categoryLabel, excerpt } from '@/lib/labs/display';

const DIFFICULTY_NAMES: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', insane: 'Insane', expert: 'Expert' };

/** `hard` as "Hard"; anything unknown is still readable */
export function difficultyLabel(difficulty: string): string {
    return DIFFICULTY_NAMES[difficulty.toLowerCase()] ?? (difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : '');
}

/** The share of the base points the next solve pays after `solvesBefore` earlier ones */
export function decayPercent(solvesBefore: number): number {
    const n = Math.max(0, Math.floor(solvesBefore));
    const band = DECAY_TABLE.find((b) => n >= b.from && (b.to === null || n <= b.to));
    return band ? band.percent : DYNAMIC_FLOOR_PERCENT;
}

/**
 * What a solve pays, the same sum as the API (`ctfScoring.service.js`): the base points in a static
 * competition; in a dynamic one a share by solves before, never below 1 and never below the floor.
 * The API pays and fixes the points: this is only for showing them.
 */
export function pointsFor(base: number, mode: CtfScoringMode, solvesBefore: number): number {
    if (mode !== 'dynamic') return base;
    const floor = Math.ceil((base * DYNAMIC_FLOOR_PERCENT) / 100);
    return Math.max(1, floor, Math.round((base * decayPercent(solvesBefore)) / 100));
}

/** "1 point" or "50 points" */
export function pointsText(points: number): string {
    return `${points} ${points === 1 ? 'point' : 'points'}`;
}

export interface PointsView {
    /** What the next solve pays, in text: "90 pts" */
    now: string;
    /** "of 100" when the value fell below the base points, else null */
    base: string | null;
    /** Whether the value is lower than the base */
    decayed: boolean;
}

/** The points of a challenge as the list shows them: current against base for a dynamic competition */
export function pointsView(challenge: Pick<CtfChallenge, 'basePoints' | 'currentPoints'>, mode: CtfScoringMode): PointsView {
    const now = Number.isFinite(challenge.currentPoints) ? challenge.currentPoints : challenge.basePoints;
    const decayed = mode === 'dynamic' && now < challenge.basePoints;
    return { now: `${now} pts`, base: decayed ? `of ${challenge.basePoints}` : null, decayed };
}

const ORDINAL = (n: number) => {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    switch (n % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
    }
};
export const placeLabel = ORDINAL;

/** Prizes in place order */
export function sortedPrizes(prizes: readonly CtfPrize[] | null | undefined): CtfPrize[] {
    return [...(prizes ?? [])].sort((a, b) => a.place - b.place);
}

/** One line for a card: the first prize and how many more there are, or the free text note */
export function prizeSummary(card: Pick<CtfCompetitionCard, 'prizes' | 'prizesNote'>): string | null {
    const prizes = sortedPrizes(card.prizes);
    if (prizes.length > 0) {
        const first = `${placeLabel(prizes[0].place)}: ${prizes[0].reward}`;
        return prizes.length > 1 ? `${first} and ${prizes.length - 1} more` : first;
    }
    const note = (card.prizesNote ?? '').trim();
    return note ? (note.length > 80 ? `${note.slice(0, 79).trimEnd()}…` : note) : null;
}

/** "12 of 100 taking part", "12 taking part" when unlimited */
export function participantsText(card: Pick<CtfCompetitionCard, 'participantCount' | 'maxParticipants' | 'teamsEnabled'>): string {
    const n = card.participantCount;
    const noun = card.teamsEnabled ? 'players' : 'players';
    return card.maxParticipants > 0 ? `${n} of ${card.maxParticipants} ${noun}` : `${n} ${n === 1 ? 'player' : noun}`;
}

/** Whether a competition has no seat left */
export const isFull = (card: Pick<CtfCompetitionCard, 'participantCount' | 'maxParticipants'>) => card.maxParticipants > 0 && card.participantCount >= card.maxParticipants;

/** A score of a competition board: a thousand separator keeps long numbers readable */
export const scoreText = (n: number) => n.toLocaleString('en-US');
