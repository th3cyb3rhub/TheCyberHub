'use client';

import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import CodeBlock from '@/components/forums/CodeBlock';
import { renderMarkdownSegments } from '@/lib/markdown';

/** Markdown from the organizer: escaped by the renderer, sanitised again here, code shown as text */
export function EventDescription({ content, className = '' }: { content: string; className?: string }) {
    const segments = useMemo(() => renderMarkdownSegments(content), [content]);
    return (
        <div className={`event-md max-w-none text-sm ${className}`}>
            {segments.map((segment, i) =>
                segment.type === 'code' ? (
                    <CodeBlock key={i} code={segment.code} language={segment.language} />
                ) : (
                    <div key={i} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(segment.html, { ADD_ATTR: ['target'] }) }} />
                )
            )}
        </div>
    );
}
