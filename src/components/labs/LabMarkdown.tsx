'use client';

import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import CodeBlock from '@/components/forums/CodeBlock';
import { sanitizeLabHtml } from '@/lib/labs/sanitize';
import { renderMarkdownSegments } from '@/lib/markdown';

/**
 * Instructions and hints are markdown or text that may quote a payload (a lab about XSS has to be
 * able to show one). Three layers, in this order: the renderer escapes everything before it adds
 * markup; `sanitizeLabHtml` keeps an allowlist of tags and attributes (it works while the page is
 * rendered on the server, so the text is in the HTML crawlers get); and once the page runs in the
 * browser DOMPurify cleans the result again. Fenced code is shown as text by the code block.
 * Never `innerHTML` the raw string.
 */
function Prose({ html }: { html: string }) {
    const safe = useMemo(() => sanitizeLabHtml(html), [html]);
    const [checked, setChecked] = useState<string | null>(null);
    useEffect(() => {
        // The second pass only ever removes things, so what the server sent can be swapped for it
        // without a visible change
        if (DOMPurify.isSupported) setChecked(DOMPurify.sanitize(safe, { ADD_ATTR: ['target'] }));
    }, [safe]);
    return <div dangerouslySetInnerHTML={{ __html: checked ?? safe }} />;
}

export function LabMarkdown({ content, className = '' }: { content: string; className?: string }) {
    const segments = useMemo(() => renderMarkdownSegments(content), [content]);
    return (
        <div className={`lab-md max-w-none break-words text-sm ${className}`} data-testid="lab-markdown">
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
