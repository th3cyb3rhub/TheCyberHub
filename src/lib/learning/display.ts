import { DIFFICULTIES, type Difficulty, type ItemKind, type PathCategory, type PathKind, type PathStatus } from '@/types/learning';
import type { LinkStatus, ReadingStatus, RejectReason, ReportReason, ResourceStatus, ResourceTopic, ResourceType } from '@/types/resource';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

export const CATEGORY_LABELS: Record<PathCategory, string> = {
    beginner: 'Getting started', offensive: 'Offensive', defensive: 'Defensive', cloud: 'Cloud', compliance: 'Compliance', career: 'Career',
};

export const KIND_LABELS: Record<PathKind, string> = { roadmap: 'Roadmap', path: 'Learning path' };

export const STATUS_LABELS: Record<PathStatus, string> = { draft: 'Draft', in_review: 'In review', published: 'Published', archived: 'Archived' };

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
    resource: 'Library resource', challenge: 'Challenge', lab: 'Lab', tool: 'Tool', cheatsheet: 'Cheatsheet', path: 'Other path', external: 'External link',
};

/** The heading a group of node items sits under */
export const ITEM_GROUP_LABELS: Record<ItemKind, string> = {
    resource: 'Resources', external: 'Links', challenge: 'Practice', lab: 'Practice', tool: 'Tools', cheatsheet: 'Cheatsheets', path: 'Related paths',
};

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
    video: 'Video', article: 'Article', course: 'Course', tool: 'Tool', book: 'Book', podcast: 'Podcast', github: 'GitHub', documentation: 'Documentation', practice: 'Practice',
};

export const RESOURCE_TOPIC_LABELS: Record<ResourceTopic, string> = {
    'web-security': 'Web security', 'network-security': 'Network security', 'malware-analysis': 'Malware analysis', forensics: 'Forensics',
    osint: 'OSINT', cryptography: 'Cryptography', 'reverse-engineering': 'Reverse engineering', 'cloud-security': 'Cloud security',
    'mobile-security': 'Mobile security', 'iot-security': 'IoT security', 'blue-team': 'Blue team', devsecops: 'DevSecOps', career: 'Career', general: 'General',
};

export const RESOURCE_STATUS_LABELS: Record<ResourceStatus, string> = { pending: 'Waiting for review', approved: 'Approved', rejected: 'Rejected' };
export const READING_LABELS: Record<ReadingStatus, string> = { 'to-read': 'To read', reading: 'Reading', done: 'Done' };
export const LINK_LABELS: Record<LinkStatus, string> = { unknown: 'Not checked', ok: 'Link works', broken: 'Link may be broken' };

export const REJECT_LABELS: Record<RejectReason, string> = {
    duplicate: 'Duplicate', low_quality: 'Low quality', broken_link: 'Broken link', self_promotion: 'Self-promotion', off_topic: 'Off-topic', other: 'Other',
};

export const REPORT_LABELS: Record<ReportReason, string> = {
    spam: 'Spam', misinformation: 'Misinformation', inappropriate: 'Inappropriate content', copyright: 'Copyright violation', broken_link: 'The link is broken', other: 'Other',
};

export const label = <T extends string>(map: Record<T, string>, key: string | null | undefined): string =>
    (key && (map as Record<string, string>)[key]) || (key ? key.replace(/[-_]/g, ' ') : '');

export const difficultyRank = (d: string) => DIFFICULTIES.indexOf(d as Difficulty);

/**
 * A link that is safe to put in an `href`: http or https only. Anything else (javascript:, data:, a
 * relative path from untrusted text) returns null, so the caller renders text instead of a link.
 */
export function safeHref(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
}

/** An in-app route from the API (`/challenges/x`), never a protocol-relative or absolute one */
export function internalHref(value: string | null | undefined): string | null {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
    if (/[\u0000-\u001f\u007f]/.test(value)) return null;
    return value;
}

/** Where a node item leads: an in-app route for platform content, a checked web link for the rest */
export function itemLink(item: { href?: string; url?: string; external?: boolean }): { href: string; external: boolean } | null {
    if (item.external) {
        const href = safeHref(item.href ?? item.url);
        return href ? { href, external: true } : null;
    }
    const href = internalHref(item.href);
    return href ? { href, external: false } : null;
}

export const EXTERNAL_REL = 'noopener noreferrer nofollow ugc';

export function pathHref(kind: PathKind | string, slug: string): string {
    return `/${kind === 'roadmap' ? 'roadmaps' : 'learning-paths'}/${slug}`;
}

export function formatDate(iso: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en', { timeZone: 'UTC', ...options }).format(d);
}

/** "3 days ago" style age for queue rows */
export function ageText(iso: string | null | undefined, now: Date = new Date()): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const mins = Math.max(0, Math.floor((now.getTime() - then) / 60000));
    if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day ago' : `${days} days ago`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
