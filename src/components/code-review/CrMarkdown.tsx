'use client';

import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import CodeBlock from '@/components/forums/CodeBlock';
import { sanitizeLabHtml } from '@/lib/labs/sanitize';
import { renderMarkdownSegments } from '@/lib/markdown';

/**
 * Explanations, hints and notes are written by the team and may quote a payload (an exercise about
 * XSS has to be able to show one). Three layers, in this order: the renderer escapes everything
 * before it adds markup; `sanitizeLabHtml` keeps an allowlist of tags and attributes (plain string
 * work, so the text is in the HTML crawlers get); and in the browser DOMPurify cleans the result
 * again. Fenced code is shown as text by the code block. This is the only place of the code review
 * screens that puts HTML in the page, and the code to review never goes through it.
 */
function Prose({ html }: { html: string }) {
    const safe = useMemo(() => sanitizeLabHtml(html), [html]);
    const [checked, setChecked] = useState<string | null>(null);
    useEffect(() => {
        if (DOMPurify.isSupported) setChecked(DOMPurify.sanitize(safe, { ADD_ATTR: ['target'] }));
    }, [safe]);
    return <div dangerouslySetInnerHTML={{ __html: checked ?? safe }} />;
}

export function CrMarkdown({ content, className = '' }: { content: string; className?: string }) {
    const segments = useMemo(() => renderMarkdownSegments(content), [content]);
    return (
        <div className={`lab-md max-w-none break-words text-sm ${className}`} data-testid="cr-markdown">
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
