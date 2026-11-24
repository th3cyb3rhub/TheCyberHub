import { fetchApi } from '@/lib/api';
import type {
    AdminPathFilters, CatalogueFilters, Certificate, EditorPath, LearningDetail, LearningNode, LearningPage, LearningProgress,
    LearningSummary, PathInput, ProgressChange,
} from '@/types/learning';

/** Builds `?a=1&b=2`, leaving out empty values. Page 1 is implied. */
export function toQuery(values: Record<string, unknown>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined || value === null || value === '' || value === false) continue;
        if (key === 'page' && Number(value) <= 1) continue;
        params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

const ref = (value: string) => encodeURIComponent(value);

export function catalogueQuery(filters: CatalogueFilters = {}): string {
    return toQuery({
        kind: filters.kind,
        category: filters.category,
        difficulty: filters.difficulty,
        search: filters.search?.trim(),
        featured: filters.featured,
        sort: filters.sort && filters.sort !== 'popular' ? filters.sort : undefined,
        page: filters.page,
        limit: filters.limit,
    });
}

/** Public, but the token is sent when there is one so every card carries the viewer block */
export function listPaths(filters: CatalogueFilters = {}): Promise<LearningPage> {
    return fetchApi(`/api/learning-paths${catalogueQuery(filters)}`);
}

export async function getPath(slugOrId: string): Promise<LearningDetail> {
    return (await fetchApi(`/api/learning-paths/${ref(slugOrId)}`)).data;
}

export async function getNextNode(slugOrId: string): Promise<LearningNode | null> {
    return (await fetchApi(`/api/learning-paths/${ref(slugOrId)}/next`)).data ?? null;
}

export async function getSummary(): Promise<LearningSummary> {
    return (await fetchApi('/api/learning-paths/user/summary')).data;
}

export async function listMyProgress(): Promise<LearningProgress[]> {
    return (await fetchApi('/api/learning-paths/user/progress')).data ?? [];
}

export async function getRecommendations(): Promise<{ completedPaths: number; recommendations: LearningPage['data'] }> {
    return (await fetchApi('/api/learning-paths/user/recommendations')).data;
}

const post = (path: string, body?: unknown) =>
    fetchApi(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export async function enrollInPath(slugOrId: string): Promise<LearningProgress> {
    return (await post(`/api/learning-paths/${ref(slugOrId)}/enroll`)).data;
}

export async function completeNode(slugOrId: string, nodeId: string): Promise<ProgressChange> {
    return (await post(`/api/learning-paths/${ref(slugOrId)}/modules/${ref(nodeId)}/complete`)).data;
}

export async function uncompleteNode(slugOrId: string, nodeId: string): Promise<ProgressChange> {
    return (await post(`/api/learning-paths/${ref(slugOrId)}/modules/${ref(nodeId)}/uncomplete`)).data;
}

export async function getMyCertificate(slugOrId: string): Promise<Certificate> {
    return (await fetchApi(`/api/learning-paths/${ref(slugOrId)}/certificate`)).data;
}

/** Public. No token, so a stale one cannot turn a valid id into a 401. */
export async function verifyCertificate(certificateId: string): Promise<Certificate> {
    return (await fetchApi(`/api/certificates/${ref(certificateId)}`, { requireAuth: false })).data;
}

// ---------------------------------------------------------------------------
// Bookmarks (the shared bookmark routes; paths and roadmaps are `roadmap`)
// ---------------------------------------------------------------------------

export async function addBookmark(contentType: 'roadmap' | 'resource', contentId: string): Promise<void> {
    await post('/api/bookmarks', { contentType, contentId });
}

export async function removeBookmark(contentType: 'roadmap' | 'resource', contentId: string): Promise<void> {
    await fetchApi(`/api/bookmarks/${contentType}/${ref(contentId)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Authoring (moderators author and submit; admins publish and manage)
// ---------------------------------------------------------------------------

export function listAdminPaths(filters: AdminPathFilters = {}): Promise<LearningPage> {
    return fetchApi(`/api/learning-paths/admin/list${toQuery({
        status: filters.status, kind: filters.kind, q: filters.q?.trim(), page: filters.page, limit: filters.limit,
    })}`);
}

export async function getEditorPath(slugOrId: string): Promise<EditorPath> {
    return (await fetchApi(`/api/learning-paths/admin/${ref(slugOrId)}`)).data;
}

export async function createPath(input: PathInput): Promise<EditorPath> {
    return (await post('/api/learning-paths', input)).data;
}

export async function updatePath(slugOrId: string, input: PathInput): Promise<EditorPath> {
    return (await fetchApi(`/api/learning-paths/${ref(slugOrId)}`, { method: 'PUT', body: JSON.stringify(input) })).data;
}

export type PathTransition = 'submit' | 'publish' | 'unpublish' | 'archive' | 'restore';

export async function transitionPath(slugOrId: string, action: PathTransition): Promise<EditorPath> {
    return (await post(`/api/learning-paths/${ref(slugOrId)}/${action}`)).data;
}

export async function requestPathChanges(slugOrId: string, note: string): Promise<EditorPath> {
    return (await post(`/api/learning-paths/${ref(slugOrId)}/request-changes`, { note })).data;
}

export async function featurePath(slugOrId: string, featured: boolean): Promise<EditorPath> {
    return (await fetchApi(`/api/learning-paths/${ref(slugOrId)}/feature`, { method: 'PATCH', body: JSON.stringify({ featured }) })).data;
}

export async function deletePath(slugOrId: string): Promise<{ deleted: boolean; archived: boolean }> {
    return (await fetchApi(`/api/learning-paths/${ref(slugOrId)}`, { method: 'DELETE' })).data;
}
