import { ExternalLink } from 'lucide-react';
import { chip, muted } from '@/components/events/styles';
import { categoryLabel } from '@/lib/codeReview/constants';
import { cweHref } from '@/lib/codeReview/display';
import { describeRange } from '@/lib/codeReview/selection';
import { SeverityBadge } from './Badges';
import { CrMarkdown } from './CrMarkdown';

interface Detail {
    lineStart: number;
    lineEnd: number;
    title: string | null;
    vulnerabilityType: string;
    severity: string;
    cwe: string | null;
    owasp: string | null;
    explanation: string;
}

/** One finding with its explanation. Text from the API is escaped, markdown goes through the sanitised path. */
export function FindingCard({ finding, index, children, note }: { finding: Detail; index: number; children?: React.ReactNode; note?: React.ReactNode }) {
    const range = describeRange({ start: finding.lineStart, end: finding.lineEnd });
    const href = cweHref(finding.cwe);
    return (
        <li className="rounded-xl border border-gray-200 p-4 dark:border-neutral-800" data-testid="finding" data-line-start={finding.lineStart}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {finding.title || `Finding ${index + 1}`} <span className={`font-normal ${muted}`}>({range})</span>
                </h4>
                <SeverityBadge severity={finding.severity} />
                <span className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>{categoryLabel(finding.vulnerabilityType)}</span>
                {finding.cwe && (href
                    ? <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={`${chip} bg-gray-100 text-gray-900 underline dark:bg-neutral-800 dark:text-gray-100`}>{finding.cwe}<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
                    : <span className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>{finding.cwe}</span>)}
                {finding.owasp && <span className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>{finding.owasp}</span>}
            </div>
            {note}
            {finding.explanation && <CrMarkdown content={finding.explanation} />}
            {children}
        </li>
    );
}
