/** One signup week of the activation funnel, as `GET /api/admin/metrics/activation` returns it */
export interface ActivationWeek {
    /** ISO week, for example "2026-W42" */
    week: string;
    signups: number;
    verified: number;
    onboarded: number;
    skipped: number;
    firstSolve: number;
    firstPost: number;
    firstComment: number;
    firstForum: number;
    firstFollow: number;
    returnedD7: number;
    returnedD30: number;
}

export type ActivationStep = Exclude<keyof ActivationWeek, 'week'>;

export interface ActivationResponse {
    weeks: ActivationWeek[];
}
