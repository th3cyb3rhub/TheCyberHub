import { fetchApi } from '@/lib/api';
import type {
    ReadingStatus, RejectReason, ReportReason, Resource, ResourceFacets, ResourceFilters, ResourceInput, ResourcePage, ReviewQueue,
    UrlCheck, Vote, VoteResult, LinkStatus,
} from '@/types/resource';
import { toQuery } from './learning';

export function resourceQuery(filters: ResourceFilters = {}): string {
    return toQuery({
        q: filters.q?.trim(),
        type: filters.type,
        topic: filters.topic,
        difficulty: filters.difficulty,
        isFree: filters.isFree,
        tag: filters.tag,
        featured: filters.featured,
        sort: filters.sort,
        page: filters.page,
        limit: filters.limit,
    });
}

const ref = (value: string) => encodeURIComponent(value);

/** Public, but the token is sent when there is one so every item carries the viewer block */
export function listResources(filters: ResourceFilters = {}): Promise<ResourcePage> {
    return fetchApi(`/api/resources${resourceQuery(filters)}`);
}

export async function getFacets(): Promise<ResourceFacets> {
    return (await fetchApi('/api/resources/facets', { requireAuth: false })).data;
}

export async function getResource(slugOrId: string): Promise<Resource> {
    return (await fetchApi(`/api/resources/${ref(slugOrId)}`)).data;
}

/** Parses and normalises a link and looks for a duplicate. The server never requests the link. */
export async function checkUrl(url: string): Promise<UrlCheck> {
    return (await fetchApi(`/api/resources/check-url?url=${encodeURIComponent(url)}`)).data;
}

export function listMySubmissions(params: { status?: string; page?: number; limit?: number } = {}): Promise<ResourcePage> {
    return fetchApi(`/api/resources/my${toQuery(params)}`);
}

export function listReading(params: { status?: ReadingStatus; page?: number; limit?: number } = {}): Promise<ResourcePage> {
    return fetchApi(`/api/resources/reading${toQuery(params)}`);
}

export function listReviewQueue(params: { queue?: ReviewQueue; q?: string; page?: number; limit?: number } = {}): Promise<ResourcePage> {
    return fetchApi(`/api/resources/review${toQuery({ ...params, q: params.q?.trim(), queue: params.queue && params.queue !== 'pending' ? params.queue : undefined })}`);
}

const send = (method: string, path: string, body?: unknown) =>
    fetchApi(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export async function createResource(input: ResourceInput): Promise<Resource> {
    return (await send('POST', '/api/resources', input)).data;
}

export async function updateResource(slugOrId: string, input: ResourceInput): Promise<Resource> {
    return (await send('PUT', `/api/resources/${ref(slugOrId)}`, input)).data;
}

export async function deleteResource(slugOrId: string): Promise<void> {
    await send('DELETE', `/api/resources/${ref(slugOrId)}`);
}

export async function voteResource(slugOrId: string, value: Vote): Promise<VoteResult> {
    return (await send('POST', `/api/resources/${ref(slugOrId)}/vote`, { value })).data;
}

export async function reportResource(slugOrId: string, input: { reason: ReportReason; details?: string }): Promise<{ reported: boolean; autoHidden?: boolean; markedBroken?: boolean }> {
    return (await send('POST', `/api/resources/${ref(slugOrId)}/report`, { reason: input.reason, details: input.details?.trim() || undefined })).data;
}

export async function setReading(slugOrId: string, status: ReadingStatus | null): Promise<void> {
    if (status === null) await send('DELETE', `/api/resources/${ref(slugOrId)}/reading`);
    else await send('PUT', `/api/resources/${ref(slugOrId)}/reading`, { status });
}

export async function approveResource(slugOrId: string): Promise<void> {
    await send('PATCH', `/api/resources/${ref(slugOrId)}/approve`);
}

export async function rejectResource(slugOrId: string, input: { reason: RejectReason; note?: string }): Promise<void> {
    await send('PATCH', `/api/resources/${ref(slugOrId)}/reject`, { reason: input.reason, note: input.note?.trim() || undefined });
}

export async function setLinkStatus(slugOrId: string, input: { status: LinkStatus; note?: string }): Promise<void> {
    await send('PATCH', `/api/resources/${ref(slugOrId)}/link-status`, { status: input.status, note: input.note?.trim() || undefined });
}

export async function featureResource(slugOrId: string, featured: boolean): Promise<void> {
    await send('PATCH', `/api/resources/${ref(slugOrId)}/feature`, { featured });
}
