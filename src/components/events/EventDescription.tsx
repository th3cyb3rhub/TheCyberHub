'use client';

import { useEffect, useMemo, useState } from 'react';
import CodeBlock from '@/components/forums/CodeBlock';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import { sanitizeLabHtml } from '@/lib/labs/sanitize';
import { renderMarkdownSegments } from '@/lib/markdown';

/**
 * The organizer's text is markdown. Three layers, in this order: the renderer escapes everything
 * before it adds markup; `sanitizeLabHtml` keeps an allowlist of tags and attributes and works while the
 * page is rendered on the server, so the description is in the HTML crawlers get and the layout does not
 * move; and in the browser DOMPurify cleans the result again. Code is shown as text by the code block.
 */
function Prose({ html }: { html: string }) {
    const safe = useMemo(() => sanitizeLabHtml(html, { images: true, mailto: true }), [html]);
    const [checked, setChecked] = useState<string | null>(null);
    useEffect(() => {
        // The second pass only ever removes things, so the server's copy can be swapped for it unseen
        const cleaned = sanitizeHtml(safe, { ADD_ATTR: ['target'] });
        setChecked(cleaned || null);
    }, [safe]);
    return <div dangerouslySetInnerHTML={{ __html: checked ?? safe }} />;
}

export function EventDescription({ content, className = '' }: { content: string; className?: string }) {
    const segments = useMemo(() => renderMarkdownSegments(content), [content]);
    return (
        <div className={`event-md max-w-none text-sm ${className}`}>
            {segments.map((segment, i) =>
                segment.type === 'code' ? (
                    <CodeBlock key={i} code={segment.code} language={segment.language} />
                ) : (
                    <Prose key={i} html={segment.html} />
                )
            )}
        </div>
    );
}
