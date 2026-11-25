'use client';

import { useMemo } from 'react';
import { useSanitizer } from '@/hooks/useSanitizer';
import CodeBlock from './CodeBlock';
import { renderMarkdownSegments } from '@/lib/markdown';

interface MarkdownContentProps {
    content: string;
    className?: string;
}

// Prose is escaped by the renderer and sanitised again here; fenced code goes to CodeBlock, which
// renders it as React text (never as HTML).
export default function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
    const sanitizeHtml = useSanitizer();
    const segments = useMemo(() => renderMarkdownSegments(content), [content]);

    return (
        <div className={`prose prose-invert prose-sm max-w-none ${className}`}>
            {segments.map((segment, i) =>
                segment.type === 'code' ? (
                    <CodeBlock key={i} code={segment.code} language={segment.language} />
                ) : (
                    <div
                        key={i}
                        dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(segment.html, { ADD_ATTR: ['target'] }),
                        }}
                    />
                )
            )}
        </div>
    );
}
