import type { InfiniteData } from '@tanstack/react-query';
import type { Resource, ResourcePage, Vote } from '@/types/resource';

/** The tally once the viewer's vote changes from what it was to `value` */
export function applyVote(resource: Resource, value: Vote): Resource {
    const before = resource.viewer?.vote ?? 0;
    if (before === value) return resource;
    const upvotes = Math.max(0, resource.upvotes + (value === 1 ? 1 : 0) - (before === 1 ? 1 : 0));
    const downvotes = Math.max(0, resource.downvotes + (value === -1 ? 1 : 0) - (before === -1 ? 1 : 0));
    return { ...resource, upvotes, downvotes, score: upvotes - downvotes, viewer: resource.viewer ? { ...resource.viewer, vote: value } : resource.viewer };
}

/** Apply `fn` to every resource with this id inside a cached value of any of the shapes the hooks store */
export function mapCached(data: unknown, id: string, fn: (r: Resource) => Resource): unknown {
    if (!data || typeof data !== 'object') return data;
    const infinite = data as InfiniteData<ResourcePage>;
    if (Array.isArray(infinite.pages)) {
        return { ...infinite, pages: infinite.pages.map((p) => ({ ...p, data: p.data.map((r) => (r.id === id ? fn(r) : r)) })) };
    }
    const page = data as ResourcePage;
    if (Array.isArray(page.data)) return { ...page, data: page.data.map((r) => (r.id === id ? fn(r) : r)) };
    const single = data as Resource;
    return single.id === id ? fn(single) : data;
}
