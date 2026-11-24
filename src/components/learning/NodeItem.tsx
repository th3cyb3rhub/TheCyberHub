'use client';

import Link from 'next/link';
import { useId } from 'react';
import {
    AlertTriangle, BookOpen, Check, ChevronDown, ExternalLink, FileText, Flag, FlaskConical, Lock, Map as MapIcon, Wrench, Loader2, type LucideIcon,
} from 'lucide-react';
import { EXTERNAL_REL, ITEM_GROUP_LABELS, itemLink } from '@/lib/learning/display';
import type { NodeState } from '@/lib/learning/progress';
import type { ItemKind, LearningItem, LearningNode } from '@/types/learning';
import { Chip } from './shared';
import { focusRing, muted } from '@/components/events/styles';

const ICONS: Record<ItemKind, LucideIcon> = {
    resource: BookOpen, challenge: Flag, lab: FlaskConical, tool: Wrench, cheatsheet: FileText, path: MapIcon, external: ExternalLink,
};

const chipClass = `group/item inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 transition-colors hover:border-orange-400 hover:bg-orange-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:border-orange-500/60 dark:hover:bg-neutral-800 ${focusRing}`;

/** One link out of a step: an in-app route for platform content, a checked web link for the rest */
export function ItemChip({ item }: { item: LearningItem }) {
    const Icon = ICONS[item.kind] ?? ExternalLink;
    const target = itemLink(item);
    const broken = item.kind === 'resource' && item.linkStatus === 'broken';
    const body = (
        <>
            <Icon className="h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
            <span className="min-w-0 truncate">{item.title}</span>
            {item.kind === 'resource' && item.domain && <span className={`hidden shrink-0 text-xs sm:inline ${muted}`}>{item.domain}</span>}
            {item.optional && <span className={`shrink-0 text-xs ${muted}`}>(optional)</span>}
            {broken && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Link may be broken
                </span>
            )}
            {target?.external && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />}
        </>
    );
    // A link that is not http(s) or an in-app route is shown as text, never as a link
    if (!target) return <span className={`${chipClass} cursor-default`}>{body}</span>;
    if (target.external) {
        return <a href={target.href} target="_blank" rel={EXTERNAL_REL} className={chipClass}>{body}<span className="sr-only"> (opens in a new tab)</span></a>;
    }
    return <Link href={target.href} className={chipClass}>{body}</Link>;
}

const GROUP_ORDER = ['Resources', 'Practice', 'Tools', 'Cheatsheets', 'Related paths', 'Links'];

export function groupItems(items: LearningItem[]): { title: string; items: LearningItem[] }[] {
    const groups = new Map<string, LearningItem[]>();
    for (const item of items) {
        const title = ITEM_GROUP_LABELS[item.kind] ?? 'Links';
        groups.set(title, [...(groups.get(title) ?? []), item]);
    }
    return GROUP_ORDER.filter((t) => groups.has(t)).map((title) => ({ title, items: groups.get(title) ?? [] }));
}

interface NodeItemProps {
    node: LearningNode;
    number: number;
    state: NodeState;
    waitingFor: string[];
    expanded: boolean;
    pending: boolean;
    onToggleExpanded: () => void;
    onTick: (done: boolean) => void;
    last?: boolean;
}

/**
 * A step of a roadmap: a round checkbox on the timeline, the title with its state, and a disclosure
 * for the description and links. The checkbox is a toggle button (`aria-pressed`).
 */
export function NodeItem({ node, number, state, waitingFor, expanded, pending, onToggleExpanded, onTick, last = false }: NodeItemProps) {
    const panelId = useId();
    const done = state === 'done';
    const hasBody = !!node.description || node.items.length > 0;
    const groups = groupItems(node.items);

    return (
        <li id={`node-${node.id}`} className="relative pl-12 pb-6 last:pb-0" data-testid="node" data-state={state}>
            {!last && <span className="absolute bottom-0 left-[17px] top-9 w-0.5 bg-gray-200 dark:bg-neutral-800" aria-hidden="true" />}
            <button
                type="button"
                aria-pressed={done}
                aria-label={`Mark step ${number} complete: ${node.title}`}
                disabled={pending}
                onClick={() => onTick(!done)}
                data-testid="node-toggle"
                className={`absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors disabled:opacity-70 ${focusRing} ${done
                    ? 'border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500 dark:text-black'
                    : state === 'next'
                        ? 'border-orange-600 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-500 dark:bg-orange-500/10 dark:text-orange-300'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-orange-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-gray-400 dark:hover:border-orange-500'}`}
            >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : done ? <Check className="h-5 w-5" aria-hidden="true" /> : <span aria-hidden="true">{number}</span>}
            </button>

            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className={`text-base font-semibold ${done ? 'text-gray-600 line-through decoration-gray-400 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                        {hasBody ? (
                            <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={onToggleExpanded} className={`inline-flex items-center gap-1.5 rounded text-left ${focusRing}`}>
                                {node.title}
                                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                            </button>
                        ) : node.title}
                    </h3>
                    {state === 'next' && <Chip tone="orange">Up next</Chip>}
                    {done && <Chip tone="green">Done</Chip>}
                    {node.optional && <Chip>Optional</Chip>}
                    {node.duration && <span className={`text-xs ${muted}`}>{node.duration}</span>}
                </div>
                {state === 'locked' && waitingFor.length > 0 && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300" title="This is advice only: you can still tick this step">
                        <Lock className="h-3 w-3 shrink-0" aria-hidden="true" /> Better after: {waitingFor.join(', ')}
                    </p>
                )}
                {hasBody && (
                    <div id={panelId} hidden={!expanded} className="mt-3 space-y-3">
                        {node.description && <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{node.description}</p>}
                        {groups.map((group) => (
                            <div key={group.title}>
                                <h4 className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${muted}`}>{group.title}</h4>
                                <ul className="flex flex-wrap gap-2">
                                    {group.items.map((item) => <li key={`${item.kind}-${item.ref}`} className="max-w-full"><ItemChip item={item} /></li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </li>
    );
}

