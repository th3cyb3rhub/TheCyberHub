import { ListChecks } from 'lucide-react';
import { cardPad, muted } from '@/components/events/styles';
import { CR_LIMITS, CR_RULES } from '@/lib/codeReview/constants';

/** How the exercise is graded and paid. The server applies these rules; this is only the explanation. */
export function RulesBox({ points, findingCount }: { points: number; findingCount: number }) {
    return (
        <section aria-labelledby="cr-rules" className={cardPad} data-testid="rules-box">
            <h2 id="cr-rules" className="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
                <ListChecks className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> How it works
            </h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-800 dark:text-gray-200">
                <li>Read the code and mark the lines that are vulnerable. {findingCount > 0 ? `There ${findingCount === 1 ? 'is 1 issue' : `are ${findingCount} issues`} to find.` : ''} The server grades your marks; the answer is never in the page.</li>
                <li>Each finding is worth {CR_RULES.findingPoints} points. A mark has to cover at least half of a finding&rsquo;s lines and not be much longer than it, so marking the whole file earns nothing.</li>
                <li>A mark that matches nothing costs {CR_RULES.falseMarkPenalty} points. Marking the same finding twice is free.</li>
                <li>You can name a vulnerability type for a mark. A wrong type still matches, but earns {CR_RULES.wrongTypeFactor}% of the finding&rsquo;s points.</li>
                <li>You pass with {CR_RULES.passPercent}% of the best possible score or more.</li>
                <li>
                    A first pass pays up to {points} points. Every graded attempt before the passing one takes {CR_RULES.attemptDecayPercent}% off (at most {CR_RULES.attemptDecayMaxPercent}%), each hint you open takes its cost off,
                    and a pass never pays less than 10% of the points. Points are paid once, on the first pass.
                </li>
                <li>The solution opens after your first graded attempt, pass or not. Opening it before you pass makes that pass pay 0 points.</li>
                <li>Hints open one at a time, in order.</li>
                <li>You can send {CR_LIMITS.attemptsPerDay} graded attempts on one exercise in 24 hours.</li>
            </ul>
            <p className={`mt-3 text-xs ${muted}`}>Staff accounts are graded like everybody else but never earn points.</p>
        </section>
    );
}
