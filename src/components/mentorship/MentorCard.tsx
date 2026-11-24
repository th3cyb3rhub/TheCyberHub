import Link from 'next/link';
import { Clock, Users } from 'lucide-react';
import { displayName, spotsLabel } from '@/lib/mentorship/display';
import type { Mentor } from '@/types/mentorship';
import { Avatar, ExpertiseChips, RatingStars } from './shared';
import { card, chip, focusRing, muted } from './styles';

/** A mentor in the directory. A full or paused mentor says so; the card never assumes a name or an avatar. */
export function MentorCard({ mentor }: { mentor: Mentor }) {
    const name = displayName(mentor.user);
    const unavailable = mentor.isPaused || !mentor.hasCapacity;
    return (
        <li className={`${card} relative flex min-w-0 flex-col p-5 transition-shadow hover:shadow-md`} data-testid="mentor-card" data-available={!unavailable}>
            <div className="flex items-start gap-3">
                <Avatar person={mentor.user} size={44} />
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                        <Link href={`/mentorship/mentor/${mentor._id}`} className={`rounded after:absolute after:inset-0 hover:underline ${focusRing}`}>{name}</Link>
                    </h3>
                    <p className={`truncate text-xs ${muted}`}>@{mentor.user.username}</p>
                    <div className="mt-1"><RatingStars rating={mentor.rating} total={mentor.totalRatings} /></div>
                </div>
                {mentor.isPaused ? (
                    <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300`}>Paused</span>
                ) : !mentor.hasCapacity ? (
                    <span className={`${chip} bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300`}>Full</span>
                ) : null}
            </div>
            <p className="mt-3 line-clamp-3 text-sm text-gray-700 dark:text-gray-300">{mentor.bio}</p>
            <ExpertiseChips areas={mentor.expertiseAreas} max={3} className="mt-3" />
            <dl className={`mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs dark:border-neutral-800 ${muted}`}>
                <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden="true" /><dt className="sr-only">Spots</dt><dd>{spotsLabel(mentor)}</dd></div>
                <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" /><dt className="sr-only">Time zone</dt><dd>{mentor.availability.timezone}</dd></div>
            </dl>
        </li>
    );
}
