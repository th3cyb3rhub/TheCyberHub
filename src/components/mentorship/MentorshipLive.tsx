'use client';

import { usePathname } from 'next/navigation';
import { useLiveMentorship } from '@/hooks/queries/useMentorship';
import { activeMentorshipId } from '@/lib/mentorship/display';

/** Listens for pushed chat messages on every mentorship page, once. The open mentorship takes the message into its chat and is not re-read. */
export function MentorshipLive() {
    useLiveMentorship(activeMentorshipId(usePathname()) ?? undefined);
    return null;
}
