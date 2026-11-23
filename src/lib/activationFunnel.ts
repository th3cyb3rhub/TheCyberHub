import type { ActivationStep, ActivationWeek } from '@/types/adminMetrics';

export const FUNNEL_STEPS: { key: ActivationStep; label: string; short: string }[] = [
    { key: 'signups', label: 'Signed up', short: 'Signups' },
    { key: 'verified', label: 'Verified their email', short: 'Verified' },
    { key: 'onboarded', label: 'Finished the welcome steps', short: 'Onboarded' },
    { key: 'skipped', label: 'Skipped the welcome steps', short: 'Skipped' },
    { key: 'firstSolve', label: 'Solved a challenge', short: 'First solve' },
    { key: 'firstPost', label: 'Posted in the feed', short: 'First post' },
    { key: 'firstComment', label: 'Commented', short: 'First comment' },
    { key: 'firstForum', label: 'Joined a forum discussion', short: 'First forum' },
    { key: 'firstFollow', label: 'Followed someone', short: 'First follow' },
    { key: 'returnedD7', label: 'Came back after 7 days', short: 'Back D7' },
    { key: 'returnedD30', label: 'Came back after 30 days', short: 'Back D30' },
];

/** The share of sign-ups that reached a step, as a whole percent; null when nobody signed up */
export function percentOf(count: number, signups: number): number | null {
    if (!signups || signups <= 0) return null;
    return Math.round((count / signups) * 100);
}

export function formatPercent(count: number, signups: number): string {
    const value = percentOf(count, signups);
    return value === null ? '-' : `${value}%`;
}

/** All the selected weeks added together, as one row */
export function totalWeeks(weeks: ActivationWeek[]): ActivationWeek {
    const total: ActivationWeek = {
        week: 'Total', signups: 0, verified: 0, onboarded: 0, skipped: 0, firstSolve: 0,
        firstPost: 0, firstComment: 0, firstForum: 0, firstFollow: 0, returnedD7: 0, returnedD30: 0,
    };
    for (const w of weeks) {
        for (const { key } of FUNNEL_STEPS) total[key] += w[key] ?? 0;
    }
    return total;
}
