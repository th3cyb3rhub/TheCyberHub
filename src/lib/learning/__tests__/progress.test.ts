import { describe, expect, it } from 'vitest';
import { applyServerProgress, applyTick, groupByStage, nextStep, nodeContext, nodeState, rewardMessages, summarize, waitingTitles } from '../progress';
import { makeDetail, modules, progress, viewer } from './fixtures';

describe('summarize', () => {
    it('ignores optional steps in the percentage', () => {
        expect(summarize(modules(), ['a', 'd'])).toMatchObject({ requiredCount: 3, requiredCompleted: 1, completedCount: 2, percent: 33, isComplete: false });
    });
    it('is complete once every required step is done', () => {
        expect(summarize(modules(), ['a', 'b', 'c'])).toMatchObject({ percent: 100, isComplete: true });
    });
    it('is never complete for a list with no required step', () => {
        expect(summarize([{ id: 'x', optional: true }], ['x'])).toMatchObject({ percent: 0, isComplete: false });
    });
});

describe('nextStep', () => {
    it('picks the first required step that is ready', () => {
        expect(nextStep(modules(), ['a'])).toMatchObject({ id: 'b', reason: 'continue', waitingFor: [] });
    });
    it('falls back to a blocked step and names what it waits for', () => {
        const list = modules();
        list[0] = { ...list[0], requires: ['zzz'] };
        expect(nextStep(list, [])).toMatchObject({ id: 'a', reason: 'blocked', waitingFor: ['zzz'] });
    });
    it('offers optional steps once the required ones are done', () => {
        expect(nextStep(modules(), ['a', 'b', 'c'])).toMatchObject({ id: 'd', reason: 'optional' });
        expect(nextStep(modules(), ['a', 'b', 'c', 'd'])).toBeNull();
    });
});

describe('node states', () => {
    const detail = makeDetail();
    const ctx = nodeContext(detail);
    it('marks done, next and advisory locked steps', () => {
        const [a, b, c, d] = detail.modules;
        expect(nodeState(a, ctx)).toBe('done');
        expect(nodeState(b, ctx)).toBe('next');
        expect(nodeState(c, ctx)).toBe('locked');
        expect(nodeState(d, ctx)).toBe('open');
    });
    it('names the missing steps for a locked node', () => {
        expect(waitingTitles(detail.modules[2], detail, ctx.keyDone)).toEqual(['Injection']);
    });
});

describe('applyTick', () => {
    it('ticks a step, moves the percentage and picks the next step', () => {
        const next = applyTick(makeDetail(), 'b', true);
        expect(next.viewer?.progress).toMatchObject({ completedModules: ['a', 'b'], percent: 67, status: 'in-progress' });
        expect(next.viewer?.next?.id).toBe('c');
    });
    it('unticks and returns to the previous numbers', () => {
        const next = applyTick(makeDetail(), 'a', false);
        expect(next.viewer?.progress).toMatchObject({ completedModules: [], percent: 0, status: 'enrolled' });
    });
    it('completes the path with the last required step', () => {
        const detail = makeDetail({ viewer: viewer({ progress: progress({ completedModules: ['a', 'b'] }) }) });
        expect(applyTick(detail, 'c', true).viewer?.progress).toMatchObject({ status: 'completed', percent: 100 });
    });
    it('keeps a completed path completed when a step is unticked', () => {
        const detail = makeDetail({ viewer: viewer({ progress: progress({ status: 'completed', completedModules: ['a', 'b', 'c'], completedAt: '2026-11-03T00:00:00Z' }) }) });
        expect(applyTick(detail, 'c', false).viewer?.progress).toMatchObject({ status: 'completed', percent: 67 });
    });
    it('joins the path when a visitor ticks without being enrolled', () => {
        const detail = makeDetail({ viewer: viewer({ enrolled: false, progress: null, next: null }) });
        const next = applyTick(detail, 'a', true);
        expect(next.viewer).toMatchObject({ enrolled: true });
        expect(next.viewer?.progress?.completedModules).toEqual(['a']);
    });
    it('does nothing for an anonymous viewer, an unknown step or a repeated tick', () => {
        const anon = makeDetail({ viewer: null });
        expect(applyTick(anon, 'a', true)).toBe(anon);
        const detail = makeDetail();
        expect(applyTick(detail, 'nope', true)).toBe(detail);
        expect(applyTick(detail, 'a', true)).toBe(detail);
    });
});

describe('applyServerProgress', () => {
    it('replaces the guess with the server numbers and drops the reward fields', () => {
        const guess = applyTick(makeDetail(), 'b', true);
        const server = { ...progress({ completedModules: ['a', 'b'], percent: 70, certificateId: null }), changed: true, completedNow: false, rewards: { pointsAwarded: 5, badges: [] }, next: null };
        const out = applyServerProgress(guess, server);
        expect(out.viewer?.progress?.percent).toBe(70);
        expect(out.viewer?.progress).not.toHaveProperty('rewards');
        expect(out.viewer?.next).toBeNull();
    });
    it('keeps the earlier next step when the answer has none', () => {
        const detail = makeDetail();
        const out = applyServerProgress(detail, progress({ percent: 40 }));
        expect(out.viewer?.next?.id).toBe('b');
    });
    it('stores the certificate id of a completed path', () => {
        const out = applyServerProgress(makeDetail(), { ...progress({ status: 'completed', percent: 100, certificateId: 'CERT-1' }), next: null });
        expect(out.viewer?.certificateId).toBe('CERT-1');
    });
});

describe('groupByStage and rewards', () => {
    it('groups steps by stage in order', () => {
        const groups = groupByStage(makeDetail());
        expect(groups.map((g) => [g.title, g.nodes.map((n) => n.id)])).toEqual([['Basics', ['a', 'b']], ['Attacks', ['c', 'd']]]);
    });
    it('shows one unnamed group when there are no stages', () => {
        const groups = groupByStage({ modules: modules(), stages: [] });
        expect(groups).toHaveLength(1);
        expect(groups[0].nodes).toHaveLength(4);
    });
    it('writes the reward messages', () => {
        expect(rewardMessages({ completedNow: true, rewards: { pointsAwarded: 1, badges: [{ name: 'Finisher' }] } }, 'Web hacking')).toEqual([
            'You completed Web hacking. Your certificate is ready.', 'You earned 1 point.', 'Badge unlocked: Finisher.',
        ]);
        expect(rewardMessages({ rewards: { pointsAwarded: 0, badges: [] } })).toEqual([]);
    });
});
