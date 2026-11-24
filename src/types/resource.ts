/** The community resource library */
import type { Pagination } from './learning';

export const RESOURCE_TYPES = ['video', 'article', 'course', 'tool', 'book', 'podcast', 'github', 'documentation', 'practice'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_TOPICS = [
    'web-security', 'network-security', 'malware-analysis', 'forensics', 'osint', 'cryptography',
    'reverse-engineering', 'cloud-security', 'mobile-security', 'iot-security', 'blue-team',
    'devsecops', 'career', 'general',
] as const;
export type ResourceTopic = (typeof RESOURCE_TOPICS)[number];

export type ResourceStatus = 'pending' | 'approved' | 'rejected';
export type LinkStatus = 'unknown' | 'ok' | 'broken';

export const READING_STATUSES = ['to-read', 'reading', 'done'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

export const REJECT_REASONS = ['duplicate', 'low_quality', 'broken_link', 'self_promotion', 'off_topic', 'other'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export const REPORT_REASONS = ['spam', 'misinformation', 'inappropriate', 'copyright', 'broken_link', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type Vote = 1 | -1 | 0;

export interface ResourceViewer {
    vote: Vote;
    bookmarked: boolean;
    reading: ReadingStatus | null;
    /** Detail only */
    isOwner?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canModerate?: boolean;
}

export interface Resource {
    id: string;
    slug: string;
    title: string;
    description: string;
    url: string;
    domain: string;
    type: ResourceType;
    topic: ResourceTopic;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    isFree: boolean;
    tags: string[];
    upvotes: number;
    downvotes: number;
    score: number;
    views: number;
    isFeatured: boolean;
    linkStatus: LinkStatus;
    source?: string;
    submittedBy: { username: string; avatar: string | null; id?: string } | null;
    createdAt: string;
    approvedAt: string | null;
    viewer: ResourceViewer | null;
    /** Own entries and staff only */
    status?: ResourceStatus;
    isHidden?: boolean;
    rejectionCode?: RejectReason | null;
    rejectionReason?: string | null;
    rejectedAt?: string | null;
    updatedAt?: string;
    /** Staff only */
    linkNote?: string | null;
    linkCheckedAt?: string | null;
    /** Detail only */
    usedIn?: { id: string; slug: string; title: string; kind: 'path' | 'roadmap' }[];
    /** Review queue only */
    submitterRecord?: { approved: number; rejected: number; pending: number };
    openReports?: number;
    sameDomainCount?: number;
}

export interface ResourcePage {
    success?: boolean;
    data: Resource[];
    pagination: Pagination;
    /** Own submissions and the review queue */
    counts?: Record<string, number>;
}

export interface FacetRow { value: string; count: number }

export interface ResourceFacets {
    total: number;
    topics: FacetRow[];
    types: FacetRow[];
    difficulties: FacetRow[];
    free: { free: number; paid: number };
}

export interface UrlCheck {
    valid: boolean;
    reason: 'invalid' | 'internal' | 'blocked' | null;
    normalized: string | null;
    domain: string | null;
    blocked: boolean;
    duplicate: { status: 'pending' | 'approved'; id?: string; slug?: string; title?: string } | null;
}

export interface VoteResult { userVote: Vote; upvotes: number; downvotes: number; score: number }

export interface ResourceInput {
    title?: string;
    description?: string;
    url?: string;
    type?: ResourceType;
    topic?: ResourceTopic;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    isFree?: boolean;
    tags?: string[];
}

export interface ResourceFilters {
    q?: string;
    type?: ResourceType | '';
    topic?: ResourceTopic | '';
    difficulty?: 'beginner' | 'intermediate' | 'advanced' | '';
    isFree?: boolean;
    tag?: string;
    featured?: boolean;
    sort?: 'top' | 'new' | 'views' | 'relevance';
    page?: number;
    limit?: number;
}

export type ReviewQueue = 'pending' | 'reported' | 'broken' | 'rejected' | 'all';
