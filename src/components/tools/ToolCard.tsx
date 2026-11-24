import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { toolHref, type ToolMeta } from '@/lib/tools/registry';
import { ToolIcon } from './ToolIcon';
import { TrustBadge } from './TrustBadge';
import { card, chip, focusRing, muted, tone } from './styles';

/** One tool on the index. Visible from the first paint: the entrance animation is progressive and off for reduced motion. */
export function ToolCard({ tool, index = 0 }: { tool: ToolMeta; index?: number }) {
    return (
        <Link
            href={toolHref(tool.slug)}
            className={`${card} ${focusRing} group relative flex h-full flex-col p-5 transition-shadow hover:shadow-md animate-enter`}
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            data-testid="tool-card"
            data-slug={tool.slug}
        >
            <div className="mb-4 flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-800 dark:bg-orange-500/10 dark:text-orange-400">
                    <ToolIcon name={tool.icon} />
                </span>
                <span className="flex flex-wrap justify-end gap-1.5">
                    {tool.popular && (
                        <span className={`${chip} ${tone.warn}`}><Sparkles className="h-3 w-3" aria-hidden="true" /> Popular</span>
                    )}
                    {!tool.enabled && <span className={`${chip} ${tone.bad}`}>Paused</span>}
                </span>
            </div>
            <h3 className="mb-1.5 font-semibold text-gray-900 group-hover:text-orange-800 dark:text-white dark:group-hover:text-orange-400">{tool.name}</h3>
            <p className={`mb-4 flex-1 text-sm leading-relaxed ${muted}`}>{tool.description}</p>
            <div className="flex items-center justify-between gap-2">
                <TrustBadge tool={tool} />
                <ArrowRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-700 dark:text-gray-500 dark:group-hover:text-orange-400" aria-hidden="true" />
            </div>
        </Link>
    );
}

export function ToolCardSkeleton() {
    return <div className={`${card} h-44 animate-pulse`} aria-hidden="true" />;
}
