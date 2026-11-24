import { DAY, isValidTimeZone, toLocalParts } from '@/lib/events/time';
import type { MentorshipMessage } from '@/types/mentorship';

/** Messages from several lists, oldest first, each id once (a refetch and the live event can both carry one) */
export function mergeMessages(...lists: MentorshipMessage[][]): MentorshipMessage[] {
    const byId = new Map<string, MentorshipMessage>();
    for (const list of lists) for (const m of list) byId.set(m._id, { ...byId.get(m._id), ...m });
    return Array.from(byId.values()).sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
}

export interface DayGroup { day: string; label: string; messages: MentorshipMessage[] }

/** "Today", "Yesterday" or "Mon, Dec 7" for a day key */
export function dayLabel(key: string, now: Date, zone: string): string {
    const today = toLocalParts(now, zone).date;
    const yesterday = toLocalParts(new Date(now.getTime() - DAY), zone).date;
    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';
    const [y, m, d] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** One pass: messages grouped by the day they were sent in the viewer's zone */
export function groupByDay(messages: MentorshipMessage[], zone: string | null, now: Date): DayGroup[] {
    const z = zone && isValidTimeZone(zone) ? zone : 'UTC';
    const groups: DayGroup[] = [];
    for (const message of messages) {
        const day = toLocalParts(message.createdAt, z).date;
        const last = groups[groups.length - 1];
        if (last && last.day === day) last.messages.push(message);
        else groups.push({ day, label: dayLabel(day, now, z), messages: [message] });
    }
    return groups;
}

export const CODE_LANGUAGES = ['', 'bash', 'python', 'javascript', 'typescript', 'c', 'cpp', 'java', 'go', 'rust', 'php', 'sql', 'powershell', 'html', 'json', 'yaml', 'text'] as const;

/** A short, safe language label, or null. The API accepts letters, digits and + # . _ - */
export function languageLabel(value: string | null | undefined): string | null {
    const label = value?.trim();
    return label && /^[A-Za-z0-9+#._-]{1,30}$/.test(label) ? label : null;
}

/** A message of this client that is still on its way, shown at once and replaced by the server's copy */
export function optimisticMessage(args: { id: string; sender: MentorshipMessage['sender']; channel: string; content: string; contentType: 'text' | 'code'; codeLanguage?: string }): MentorshipMessage {
    return {
        _id: args.id,
        channel: args.channel,
        sender: args.sender,
        content: args.content,
        contentType: args.contentType,
        codeLanguage: args.contentType === 'code' ? args.codeLanguage || null : null,
        attachment: null,
        hidden: false,
        isRead: false,
        readAt: null,
        createdAt: new Date().toISOString(),
        pending: 'sending',
    };
}

/**
 * The API strips raw HTML tags from chat text except inside a fenced block, so a code message is
 * sent wrapped in a fence (the language after the opening fence) and unwrapped again for display.
 * The fence is longer than any run of backticks in the code, so the code can never close it early.
 */
export function fenceCode(code: string, language?: string | null): string {
    const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    const label = languageLabel(language) ?? '';
    return `${fence}${label}\n${code.replace(/\s+$/, '')}\n${fence}`;
}

/** The code and language inside a fenced message. A message without a fence is shown as it is. */
export function unfenceCode(content: string, language?: string | null): { code: string; language: string | null } {
    const m = /^(`{3,})([^\n`]*)\n([\s\S]*?)\n?\1\s*$/.exec(content);
    if (!m) return { code: content, language: languageLabel(language) };
    return { code: m[3], language: languageLabel(language) ?? languageLabel(m[2]) };
}
