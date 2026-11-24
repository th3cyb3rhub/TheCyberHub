import type { Metadata } from 'next';
import { FALLBACK_TOOLS } from './registry';

/** Page title and description of a tool, taken from the registry so the page, the index and search say the same thing */
export function toolMetadata(slug: string): Metadata {
    const tool = FALLBACK_TOOLS.find((t) => t.slug === slug);
    if (!tool) return { title: 'Security Tools | TheCyberHub' };
    return {
        title: `${tool.name} | TheCyberHub`,
        description: tool.description,
        openGraph: { title: `${tool.name} | TheCyberHub`, description: tool.description, type: 'website' },
    };
}
