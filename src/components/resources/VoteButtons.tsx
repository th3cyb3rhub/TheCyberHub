'use client';

import { ArrowBigDown, ArrowBigUp } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useVoteResource } from '@/hooks/queries/useResources';
import type { Resource, Vote } from '@/types/resource';
import { useGoToSignIn } from '@/components/learning/shared';
import { focusRing } from '@/components/events/styles';

const base = `inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const off = 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-300 dark:hover:bg-neutral-800';

/**
 * Up and down vote with the net score between. A click on the vote you already cast takes it back.
 * You cannot vote on your own entry; a signed out visitor is sent to sign in.
 */
export function VoteButtons({ resource, isOwner }: { resource: Resource; isOwner?: boolean }) {
    const { user } = useAuth();
    const vote = useVoteResource();
    const goToSignIn = useGoToSignIn();
    const own = isOwner ?? (!!user && resource.submittedBy?.username === user.username);
    const current: Vote = resource.viewer?.vote ?? 0;

    const cast = (value: 1 | -1) => {
        if (!user) {
            goToSignIn();
            return;
        }
        vote.mutate({ id: resource.id, slug: resource.slug, value: current === value ? 0 : value });
    };

    return (
        <div className="inline-flex items-center gap-1.5" role="group" aria-label={`Votes for ${resource.title}`} data-testid="votes">
            <button
                type="button"
                aria-pressed={current === 1}
                aria-label={`Upvote ${resource.title}`}
                disabled={own || vote.isPending}
                title={own ? 'You cannot vote on your own submission' : undefined}
                onClick={() => cast(1)}
                className={`${base} ${current === 1 ? 'border-green-700 bg-green-700 text-white dark:border-green-500 dark:bg-green-500 dark:text-black' : off}`}
            ><ArrowBigUp className="h-5 w-5" aria-hidden="true" /></button>
            <span className="min-w-6 text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-white" aria-live="polite" aria-label={`Score ${resource.score}`} data-testid="score">{resource.score}</span>
            <button
                type="button"
                aria-pressed={current === -1}
                aria-label={`Downvote ${resource.title}`}
                disabled={own || vote.isPending}
                title={own ? 'You cannot vote on your own submission' : undefined}
                onClick={() => cast(-1)}
                className={`${base} ${current === -1 ? 'border-red-700 bg-red-700 text-white dark:border-red-500 dark:bg-red-500 dark:text-black' : off}`}
            ><ArrowBigDown className="h-5 w-5" aria-hidden="true" /></button>
        </div>
    );
}
