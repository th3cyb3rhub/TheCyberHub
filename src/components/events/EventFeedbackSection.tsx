'use client';

import { useState } from 'react';
import { Loader2, MessageSquare, Star } from 'lucide-react';
import { useEventFeedback, useSubmitEventFeedback } from '@/hooks/queries/useEvents';
import { eventErrorMessage } from '@/lib/events/errors';
import type { EventDetail } from '@/types/event';
import { btnPrimary, cardPad, focusRing, input, label as labelClass, muted } from './styles';

const COMMENT_MAX = 500;

export function Stars({ value, label }: { value: number; label: string }) {
    return (
        <span className="inline-flex items-center gap-0.5" role="img" aria-label={label}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={`h-4 w-4 ${n <= Math.round(value) ? 'fill-yellow-500 text-yellow-500' : 'text-gray-400 dark:text-neutral-600'}`} aria-hidden="true" />
            ))}
        </span>
    );
}

function FeedbackForm({ event }: { event: EventDetail }) {
    const submit = useSubmitEventFeedback();
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [error, setError] = useState<string | null>(null);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (rating < 1) {
            setError('Pick a rating from 1 to 5 stars.');
            return;
        }
        setError(null);
        submit.mutate({ id: event._id, rating, comment }, { onError: (err) => setError(eventErrorMessage(err)) });
    };

    return (
        <form onSubmit={onSubmit} className="space-y-4" aria-label="Leave feedback" data-testid="feedback-form">
            <fieldset>
                <legend className={labelClass}>How was it?</legend>
                <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                        <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={rating === n}
                            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
                            onClick={() => setRating(n)}
                            className={`rounded-lg p-1.5 ${focusRing}`}
                        >
                            <Star className={`h-7 w-7 ${n <= rating ? 'fill-yellow-500 text-yellow-500' : 'text-gray-400 dark:text-neutral-600'}`} aria-hidden="true" />
                        </button>
                    ))}
                </div>
            </fieldset>
            <div>
                <label htmlFor="feedback-comment" className={labelClass}>Comment (optional)</label>
                <textarea id="feedback-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={COMMENT_MAX} className={`${input} resize-none`} />
                <p className={`mt-1 text-right text-xs ${muted}`} aria-hidden="true">{comment.length}/{COMMENT_MAX}</p>
            </div>
            {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
            <button type="submit" className={btnPrimary} disabled={submit.isPending}>
                {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Send feedback
            </button>
        </form>
    );
}

/** Ratings and comments of an ended event, and the form for people who were registered */
export function EventFeedbackSection({ event }: { event: EventDetail }) {
    const feedback = useEventFeedback(event._id);
    const viewer = event.viewer;
    const average = event.stats?.averageRating ?? event.averageRating;
    const count = event.stats?.ratingCount ?? event.ratingCount;
    const comments = (feedback.data?.feedback ?? []).filter((f) => f.comment);

    return (
        <section aria-labelledby="feedback-heading" className={cardPad} data-testid="feedback-section">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 id="feedback-heading" className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                    <MessageSquare className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Feedback
                </h2>
                {count > 0 && average !== null && (
                    <p className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <Stars value={average} label={`Average rating ${average.toFixed(1)} out of 5`} />
                        <span>{average.toFixed(1)} from {count} {count === 1 ? 'rating' : 'ratings'}</span>
                    </p>
                )}
            </div>

            {viewer?.canFeedback && !viewer.hasFeedback && <div className="mb-6"><FeedbackForm event={event} /></div>}
            {viewer?.hasFeedback && <p className="mb-4 text-sm text-green-800 dark:text-green-300">Thanks, your feedback was recorded.</p>}

            {feedback.isLoading ? (
                <div className="space-y-3" role="status" aria-label="Loading feedback">
                    {[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-200 dark:bg-neutral-800" />)}
                </div>
            ) : feedback.isError ? (
                <div role="alert" className="flex items-center gap-3 text-sm text-red-700 dark:text-red-400">
                    <span>{eventErrorMessage(feedback.error, 'Could not load the feedback.')}</span>
                    <button type="button" className="font-medium underline" onClick={() => void feedback.refetch()}>Try again</button>
                </div>
            ) : comments.length === 0 ? (
                <p className={`text-sm ${muted}`}>{count > 0 ? 'Nobody left a comment yet.' : 'No feedback yet.'}</p>
            ) : (
                <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
                    {comments.map((f, i) => (
                        <li key={`${f.submittedAt}-${i}`} className="py-3">
                            <div className="mb-1 flex items-center gap-2 text-sm">
                                <Stars value={f.rating} label={`${f.rating} out of 5`} />
                                <span className="font-medium text-gray-900 dark:text-white">{f.author}</span>
                            </div>
                            <p className="whitespace-pre-line break-words text-sm text-gray-700 dark:text-gray-300">{f.comment}</p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
