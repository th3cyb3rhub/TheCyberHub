'use client';

import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Lock } from 'lucide-react';
import { btnSecondary, cardPad, muted } from '@/components/events/styles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSolution } from '@/hooks/queries/useCodeReview';
import { crErrorMessage } from '@/lib/codeReview/errors';
import type { CrDetail, CrExploitExample, CrFinding, CrSolution } from '@/types/codeReview';
import { CodeText } from './CodeLines';
import { CrMarkdown } from './CrMarkdown';
import { FindingCard } from './FindingCard';

function Block({ title, code }: { title: string; code: string }) {
    if (!code.trim()) return null;
    return (
        <div>
            <h4 className="mb-1.5 text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
            <CodeText code={code} label={title} idPrefix={`sol-${title.toLowerCase().replace(/\W+/g, '-')}`} />
        </div>
    );
}

function Example({ example }: { example: CrExploitExample }) {
    const any = example.title || example.description || example.payload || example.result;
    if (!any) return null;
    return (
        <div className="space-y-2" data-testid="exploit-example">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{example.title || 'Exploit example'}</h4>
            {example.description && <CrMarkdown content={example.description} />}
            {example.payload && <Block title="Payload" code={example.payload} />}
            {example.result && <Block title="Result" code={example.result} />}
        </div>
    );
}

function FindingExtras({ finding }: { finding: CrFinding }) {
    const { exploit, fix } = finding;
    if (!exploit && !fix) return null;
    return (
        <div className="mt-3 space-y-3">
            {exploit && (exploit.description || exploit.payload || exploit.result) && (
                <div className="space-y-2">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">How it is exploited</h5>
                    {exploit.description && <CrMarkdown content={exploit.description} />}
                    {exploit.payload && <Block title="Payload" code={exploit.payload} />}
                    {exploit.result && <Block title="Result" code={exploit.result} />}
                </div>
            )}
            {fix && (fix.description || fix.code) && (
                <div className="space-y-2">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">How to fix it</h5>
                    {fix.description && <CrMarkdown content={fix.description} />}
                    {fix.code && <Block title="Fix" code={fix.code} />}
                </div>
            )}
        </div>
    );
}

function SolutionBody({ solution }: { solution: CrSolution }) {
    return (
        <div className="space-y-5" data-testid="solution-body">
            {solution.explanation && (
                <div>
                    <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-white">Overview</h3>
                    <CrMarkdown content={solution.explanation} />
                </div>
            )}
            <div>
                <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-white">All findings ({solution.findings.length})</h3>
                <ul className="space-y-3">
                    {solution.findings.map((f, i) => <FindingCard key={`${f.lineStart}-${f.lineEnd}`} finding={f} index={i}><FindingExtras finding={f} /></FindingCard>)}
                </ul>
            </div>
            <Block title="Fixed code" code={solution.fixedCode} />
            <Block title="Exploited code" code={solution.exploitedCode} />
            <Block title="Fixed code against the exploit" code={solution.fixedExploitedCode} />
            {solution.exploitExample && <Example example={solution.exploitExample} />}
        </div>
    );
}

/**
 * The solution. It is locked until the member's first graded attempt (the API decides), and opening
 * it before passing makes the pass pay 0 points, so a dialog says so first. Every text of it is
 * shown as text.
 */
export function SolutionPanel({ snippet, signedIn, staff, loading = false }: { snippet: CrDetail; signedIn: boolean; staff: boolean; loading?: boolean }) {
    const viewer = snippet.viewer;
    const [wanted, setWanted] = useState(false);
    const [shown, setShown] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const solution = useSolution(snippet.slug, wanted);

    const unlocked = staff || !!viewer?.solutionUnlocked;
    const forfeits = !staff && !!viewer && !viewer.passed && !viewer.solutionViewed;
    const open = () => { setConfirming(false); setShown(true); setWanted(true); };
    const press = () => { if (forfeits && !solution.data) setConfirming(true); else open(); };

    return (
        <section aria-labelledby="cr-solution" className={cardPad} data-testid="solution-panel">
            <h2 id="cr-solution" className="mb-1 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
                <KeyRound className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Solution
            </h2>

            {!signedIn ? (
                <p className={`text-sm ${muted}`} data-testid="solution-locked">Sign in and submit your first attempt to unlock the solution.</p>
            ) : loading || (!viewer && !staff) ? (
                <p className={`text-sm ${muted}`}>Checking your progress.</p>
            ) : !unlocked ? (
                <>
                    <p className={`mb-3 text-sm ${muted}`} data-testid="solution-locked">The solution is locked until your first graded attempt. Submit your marks and it opens, pass or not.</p>
                    <button type="button" className={btnSecondary} disabled><Lock className="h-4 w-4" aria-hidden="true" /> Show solution</button>
                </>
            ) : (
                <>
                    <p className={`mb-3 text-sm ${muted}`}>
                        {staff
                            ? 'As staff you can read the solution at any time.'
                            : viewer?.passed
                                ? 'You passed this exercise, so you can read the solution.'
                                : viewer?.solutionViewed
                                    ? 'You already opened the solution before passing, so a pass on this exercise pays 0 points.'
                                    : 'Opening the solution before you pass means a pass pays 0 points. You can still pass it for the practice.'}
                    </p>
                    {solution.isError && <p role="alert" className="mb-3 text-sm text-red-800 dark:text-red-300" data-testid="solution-error">{crErrorMessage(solution.error)}</p>}
                    <div className="mb-4 flex flex-wrap gap-2">
                        {solution.data && wanted ? (
                            <button type="button" className={btnSecondary} onClick={() => setShown((v) => !v)} aria-expanded={shown}>
                                {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />} {shown ? 'Hide solution' : 'Show solution'}
                            </button>
                        ) : (
                            <button type="button" className={btnSecondary} onClick={() => (solution.isError ? void solution.refetch() : press())} disabled={solution.isFetching}>
                                {solution.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                                {solution.isError ? 'Try again' : 'Show solution'}
                            </button>
                        )}
                    </div>
                    {solution.data && wanted && shown && <SolutionBody solution={solution.data} />}
                </>
            )}

            <ConfirmDialog
                open={confirming}
                variant="warning"
                title="Open the solution before passing?"
                description="If you open the solution now and pass later, that pass pays 0 points. Points are paid once, on the first pass, so they cannot be earned afterwards. You can still pass for the practice. Open it only if you are done trying."
                confirmText="Open the solution"
                cancelText="Keep trying"
                onCancel={() => setConfirming(false)}
                onConfirm={open}
            />
        </section>
    );
}
