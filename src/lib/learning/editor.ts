import type { EditorNode, EditorPath, PathInput } from '@/types/learning';
import type { PathEditorValues } from './schemas';

export type EditorNodeValues = PathEditorValues['modules'][number];

export const emptyPathValues = (): PathEditorValues => ({
    title: '', kind: 'roadmap', category: 'beginner', difficulty: 'beginner', estimatedDuration: '', icon: '', shortDescription: '',
    description: '', skills: [], prerequisites: [], metaDescription: '', isFeatured: false, modules: [],
});

export function valuesFromPath(path: EditorPath): PathEditorValues {
    return {
        title: path.title,
        kind: path.kind,
        category: path.category,
        difficulty: path.difficulty,
        estimatedDuration: path.estimatedDuration ?? '',
        icon: path.icon ?? '',
        shortDescription: path.shortDescription ?? '',
        description: path.description ?? '',
        skills: path.skills ?? [],
        prerequisites: (path.prerequisites ?? []).map((p) => p.id),
        metaDescription: path.seo?.metaDescription ?? '',
        isFeatured: !!path.isFeatured,
        modules: (path.modules ?? []).map(nodeValues),
    };
}

const nodeValues = (m: EditorNode): EditorNodeValues => ({
    id: m.id,
    key: m.key,
    title: m.title,
    description: m.description ?? '',
    stage: m.stage ?? '',
    duration: m.duration ?? '',
    optional: !!m.optional,
    requires: m.requires ?? [],
    items: (m.items ?? []).map((i) => ({ kind: i.kind, ref: i.ref, title: i.title ?? '', optional: !!i.optional })),
});

/**
 * The request body. Nodes that already exist keep their `_id` (so members' progress survives) and
 * the loaded `updatedAt` rides along as `ifUnmodifiedSince` so a newer save is not overwritten.
 */
export function pathInput(values: PathEditorValues, options: { updatedAt?: string; isAdmin?: boolean } = {}): PathInput {
    const input: PathInput = {
        title: values.title,
        kind: values.kind,
        category: values.category,
        difficulty: values.difficulty,
        estimatedDuration: values.estimatedDuration,
        icon: values.icon || undefined,
        shortDescription: values.shortDescription,
        description: values.description,
        skills: values.skills,
        prerequisites: values.prerequisites,
        seo: { metaDescription: values.metaDescription },
        modules: values.modules.map((m) => ({
            ...(m.id ? { _id: m.id } : {}),
            key: m.key,
            title: m.title,
            description: m.description,
            stage: m.stage,
            duration: m.duration,
            optional: m.optional,
            requires: m.requires,
            items: m.items.map((i) => ({ kind: i.kind, ref: i.ref, ...(i.title ? { title: i.title } : {}), optional: i.optional })),
        })),
    };
    if (options.isAdmin) input.isFeatured = values.isFeatured;
    if (options.updatedAt) input.ifUnmodifiedSince = options.updatedAt;
    return input;
}

/** A key from a title: lower case, dashes, unique among `taken` */
export function keyFromTitle(title: string, taken: Iterable<string>): string {
    const used = new Set(taken);
    const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'step';
    let key = base;
    let n = 1;
    while (used.has(key)) {
        n += 1;
        key = `${base}-${n}`;
    }
    return key;
}

export function newNode(taken: Iterable<string>, stage = ''): EditorNodeValues {
    return { key: keyFromTitle('step', taken), title: '', description: '', stage, duration: '', optional: false, requires: [], items: [] };
}

/** Move a node one place; the keys other nodes require are unaffected */
export function moveNode<T>(list: T[], index: number, delta: -1 | 1): T[] {
    const target = index + delta;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

/** Remove a node and drop it from the `requires` of the others */
export function removeNode(nodes: EditorNodeValues[], index: number): EditorNodeValues[] {
    const key = nodes[index]?.key;
    return nodes.filter((_, i) => i !== index).map((n) => ({ ...n, requires: n.requires.filter((k) => k !== key) }));
}

/** Rename a key everywhere it is required */
export function renameKey(nodes: EditorNodeValues[], index: number, key: string): EditorNodeValues[] {
    const old = nodes[index].key;
    return nodes.map((n, i) => (i === index
        ? { ...n, key }
        : { ...n, requires: n.requires.map((k) => (k === old ? key : k)) }));
}

export const valuesEqual = (a: PathEditorValues, b: PathEditorValues) => JSON.stringify(a) === JSON.stringify(b);
