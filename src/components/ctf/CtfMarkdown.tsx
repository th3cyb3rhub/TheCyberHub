'use client';

import { LabMarkdown } from '@/components/labs/LabMarkdown';

/**
 * Rules, descriptions and challenge text are markdown or text that may quote a payload. The same
 * three layers as the labs: the renderer escapes before it adds markup, an allowlist keeps a fixed
 * set of tags (only http and https links, remote images become plain links), and DOMPurify cleans
 * the result in the browser. Fenced code is shown as text. Never `innerHTML` the raw string.
 */
export function CtfMarkdown({ content, className = '' }: { content: string; className?: string }) {
    return (
        <div data-testid="ctf-markdown">
            <LabMarkdown content={content} className={className} />
        </div>
    );
}
