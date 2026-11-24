'use client';

import { LabMarkdown } from '@/components/labs/LabMarkdown';

/**
 * A job description is text from the poster, so it never reaches the page as HTML. It goes through
 * the same three layers as lab and competition text: the renderer escapes before it adds markup, an
 * allowlist keeps a fixed set of tags (only http and https links, remote images become plain
 * links), and DOMPurify cleans the result in the browser. Never `innerHTML` the raw string.
 */
export function JobMarkdown({ content, className = '' }: { content: string; className?: string }) {
    return (
        <div data-testid="job-markdown">
            <LabMarkdown content={content} className={className} />
        </div>
    );
}
