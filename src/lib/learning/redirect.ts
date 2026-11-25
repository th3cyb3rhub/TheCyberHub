import { PATH_KINDS, type PathKind } from '@/types/learning';
import { pathHref } from './display';

const isKind = (value: unknown): value is PathKind => typeof value === 'string' && (PATH_KINDS as readonly string[]).includes(value);

/** A slug the API gave us, safe to put in an address: a non-empty string without control characters */
const isUsableSlug = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);

/**
 * Where a roadmap or learning path that was opened under the other kind's address lives, or null when
 * the page should simply render: the API sent no usable kind or slug, the path already is of this
 * kind, or the target would be the address that was asked for (never a loop).
 */
export function pathMoveTarget(kind: PathKind, requestedSlug: string, path: { kind?: unknown; slug?: unknown }): string | null {
    if (!isKind(path.kind) || path.kind === kind) return null;
    if (!isUsableSlug(path.slug)) return null;
    const target = pathHref(path.kind, encodeURIComponent(path.slug));
    return target === pathHref(kind, encodeURIComponent(requestedSlug)) ? null : target;
}
