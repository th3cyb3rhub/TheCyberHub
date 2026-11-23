import type { GroupActor, NotificationData } from '@/types/notifications';

/** What the group did to the member's post, by notification type. Only these types are ever grouped. */
const GROUP_VERBS: Record<string, string> = {
    like: 'liked your post',
    reshare: 'reshared your post',
    comment: 'commented on your post',
};

/** At most this many people are named; everyone else is counted */
const NAMED = 2;

export interface GroupDescription {
    /** "Alice, Bob and 3 others" */
    lead: string;
    /** "liked your post" */
    tail: string;
    /** lead and tail as one sentence */
    sentence: string;
}

export function isGrouped(n: Pick<NotificationData, 'actorCount'>): boolean {
    return (n.actorCount ?? 1) > 1;
}

/** "Alice", "Alice and Bob", "Alice, Bob and 1 other", "Alice, Bob and 3 others" */
export function joinNames(names: string[], count: number): string {
    const total = Math.max(count, names.length);
    if (names.length === 0) return total === 1 ? 'Someone' : `${total} people`;
    const named = names.slice(0, NAMED);
    const others = total - named.length;
    if (others <= 0) {
        return named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
    }
    return `${named.join(', ')} and ${others} ${others === 1 ? 'other' : 'others'}`;
}

function actorNames(n: NotificationData): string[] {
    const fromGroup = (n.recentActors ?? []).map((a) => a.username).filter(Boolean);
    if (fromGroup.length > 0) return fromGroup;
    return n.actor?.username ? [n.actor.username] : [];
}

/** The sentence for a grouped notification, or null when the row is shown the ordinary way */
export function describeGroup(n: NotificationData): GroupDescription | null {
    const count = n.actorCount ?? 1;
    const tail = GROUP_VERBS[n.type];
    if (count <= 1 || !tail) return null;
    const lead = joinNames(actorNames(n), count);
    return { lead, tail, sentence: `${lead} ${tail}` };
}

/** The people to show as stacked avatars, newest first, at most three */
export function groupAvatars(n: NotificationData): GroupActor[] {
    return (n.recentActors ?? []).slice(0, 3);
}
