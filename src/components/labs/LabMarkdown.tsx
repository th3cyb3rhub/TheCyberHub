'use client';

import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import CodeBlock from '@/components/forums/CodeBlock';
import { renderMarkdownSegments } from '@/lib/markdown';

/**
 * Instructions and hints are markdown or text that may quote a payload (a lab about XSS has to be
 * able to show one). The renderer escapes everything before it adds markup, DOMPurify cleans the
 * result again, and fenced code is shown as text by the code block. Never `innerHTML` the raw string.
 */
export function LabMarkdown({ content, className = '' }: { content: string; className?: string }) {
    const segments = useMemo(() => renderMarkdownSegments(content), [content]);
    return (
        <div className={`lab-md max-w-none break-words text-sm ${className}`} data-testid="lab-markdown">
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
