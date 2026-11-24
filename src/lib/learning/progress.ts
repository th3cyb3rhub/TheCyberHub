import type { LearningDetail, LearningNode, LearningProgress, ProgressStatus } from '@/types/learning';

/**
 * Progress arithmetic for the roadmap page. It mirrors the server (optional nodes never move the
 * percentage, a completed path stays completed), so a tick can be shown before the API answers and
 * the server's numbers replace it a moment later.
 */

export interface Summary {
    totalCount: number;
    requiredCount: number;
    requiredCompleted: number;
    completedCount: number;
    percent: number;
    isComplete: boolean;
}

export function summarize(modules: Pick<LearningNode, 'id' | 'optional'>[], completedIds: Iterable<string>): Summary {
    const done = new Set(completedIds);
    let requiredCount = 0;
    let requiredCompleted = 0;
    let completedCount = 0;
    for (const node of modules) {
        const isDone = done.has(node.id);
        if (isDone) completedCount += 1;
        if (!node.optional) {
            requiredCount += 1;
            if (isDone) requiredCompleted += 1;
        }
    }
    const percent = requiredCount === 0 ? 0 : Math.min(100, Math.round((requiredCompleted / requiredCount) * 100));
    return { totalCount: modules.length, requiredCount, requiredCompleted, completedCount, percent, isComplete: requiredCount > 0 && requiredCompleted === requiredCount };
}

/** The best node to do next, by the server's rule: ready first, then blocked, then optional */
export function nextStep(modules: LearningNode[], completedIds: Iterable<string>): LearningNode | null {
    const done = new Set(completedIds);
    const keyDone = new Set(modules.filter((m) => m.key && done.has(m.id)).map((m) => m.key));
    const waiting = (node: LearningNode) => (node.requires ?? []).filter((key) => !keyDone.has(key));

    let blocked: LearningNode | null = null;
    for (let index = 0; index < modules.length; index += 1) {
        const node = modules[index];
        if (node.optional || done.has(node.id)) continue;
        const missing = waiting(node);
        if (missing.length === 0) return { ...node, index, reason: 'continue', waitingFor: [] };
        if (!blocked) blocked = { ...node, index, reason: 'blocked', waitingFor: missing };
    }
    if (blocked) return blocked;
    for (let index = 0; index < modules.length; index += 1) {
        const node = modules[index];
        if (node.optional && !done.has(node.id)) return { ...node, index, reason: 'optional', waitingFor: [] };
    }
    return null;
}

export type NodeState = 'done' | 'next' | 'locked' | 'open';

/**
 * done: ticked. next: the best step now. locked: waits on steps that are not done (advice only, the
 * member can still tick it). open: everything else.
 */
export function nodeState(node: LearningNode, ctx: { completed: Set<string>; keyDone: Set<string>; nextId: string | null }): NodeState {
    if (ctx.completed.has(node.id)) return 'done';
    if (ctx.nextId && node.id === ctx.nextId) return 'next';
    if ((node.requires ?? []).some((key) => !ctx.keyDone.has(key))) return 'locked';
    return 'open';
}

export function nodeContext(detail: Pick<LearningDetail, 'modules' | 'viewer'>) {
    const completed = new Set(detail.viewer?.progress?.completedModules ?? []);
    const keyDone = new Set(detail.modules.filter((m) => m.key && completed.has(m.id)).map((m) => m.key));
    return { completed, keyDone, nextId: detail.viewer?.next?.id ?? null };
}

/** Titles of the nodes a node is still waiting for */
export function waitingTitles(node: LearningNode, detail: Pick<LearningDetail, 'modules'>, keyDone: Set<string>): string[] {
    const byKey = new Map(detail.modules.map((m) => [m.key, m]));
    return (node.requires ?? []).filter((key) => !keyDone.has(key)).map((key) => byKey.get(key)?.title ?? key);
}

function baseProgress(detail: LearningDetail): LearningProgress {
    const existing = detail.viewer?.progress;
    if (existing) return existing;
    const s = summarize(detail.modules, []);
    const now = new Date().toISOString();
    return {
        pathId: detail.id, pathSlug: detail.slug, kind: detail.kind, status: 'enrolled', progress: 0, percent: 0, completedModules: [],
        completedCount: 0, requiredCount: s.requiredCount, requiredCompleted: 0, totalModules: s.totalCount, enrolledAt: now, startedAt: null,
        completedAt: null, lastActivityAt: now, currentStreak: 0, longestStreak: 0, certificateId: null,
    };
}

/**
 * The page as it will look once the tick is accepted. Ticking joins the path, so an anonymous-looking
 * viewer block of a signed-in member turns enrolled. A completed path stays completed on untick.
 */
export function applyTick(detail: LearningDetail, nodeId: string, done: boolean): LearningDetail {
    if (!detail.viewer) return detail;
    const node = detail.modules.find((m) => m.id === nodeId);
    if (!node) return detail;
    const before = baseProgress(detail);
    const has = before.completedModules.includes(nodeId);
    if (done === has) return detail;

    const completedModules = done ? [...before.completedModules, nodeId] : before.completedModules.filter((id) => id !== nodeId);
    const s = summarize(detail.modules, completedModules);
    const wasComplete = before.status === 'completed';
    const status: ProgressStatus = wasComplete || s.isComplete ? 'completed' : s.completedCount > 0 ? 'in-progress' : 'enrolled';
    const progress: LearningProgress = {
        ...before,
        status,
        completedModules,
        completedCount: s.completedCount,
        requiredCount: s.requiredCount,
        requiredCompleted: s.requiredCompleted,
        totalModules: s.totalCount,
        percent: s.percent,
        progress: s.percent,
        completedAt: before.completedAt ?? (s.isComplete && done ? new Date().toISOString() : null),
    };
    return {
        ...detail,
        viewer: { ...detail.viewer, enrolled: true, progress, next: nextStep(detail.modules, completedModules) },
    };
}

/** Replace the optimistic numbers with what the server answered */
export function applyServerProgress(detail: LearningDetail, change: LearningProgress & { next?: LearningNode | null }): LearningDetail {
    if (!detail.viewer) return detail;
    const { next, ...progress } = change as LearningProgress & { next?: LearningNode | null; changed?: boolean; completedNow?: boolean; rewards?: unknown };
    const clean = { ...progress } as Record<string, unknown>;
    delete clean.changed;
    delete clean.completedNow;
    delete clean.rewards;
    const resolvedNext = next === undefined ? detail.viewer.next : (next ? { ...(detail.modules.find((m) => m.id === next.id) ?? next), ...next } : null);
    return {
        ...detail,
        viewer: {
            ...detail.viewer,
            enrolled: true,
            progress: clean as unknown as LearningProgress,
            next: resolvedNext,
            certificateId: (clean.certificateId as string | null) ?? detail.viewer.certificateId,
        },
    };
}

/** Group nodes by stage, in order, for the page. Nodes without a stage share one unnamed group. */
export function groupByStage(detail: Pick<LearningDetail, 'modules' | 'stages'>): { title: string; nodes: LearningNode[] }[] {
    const byId = new Map(detail.modules.map((m) => [m.id, m]));
    const stages = detail.stages?.length ? detail.stages : [{ title: '', moduleIds: detail.modules.map((m) => m.id) }];
    return stages
        .map((s) => ({ title: s.title, nodes: s.moduleIds.map((id) => byId.get(id)).filter((n): n is LearningNode => !!n) }))
        .filter((s) => s.nodes.length > 0);
}
