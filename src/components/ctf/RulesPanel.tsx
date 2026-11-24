'use client';

import { Gift, ListChecks, Scale } from 'lucide-react';
import { cardPad, muted } from '@/components/events/styles';
import { placeLabel, sortedPrizes } from '@/lib/ctf/display';
import type { CtfCompetition } from '@/types/ctf';
import { CtfMarkdown } from './CtfMarkdown';
import { ScoringExplainer } from './ScoringExplainer';

/** Rules (sanitised markdown), prizes and how points work */
export function RulesPanel({ competition }: { competition: CtfCompetition }) {
    const prizes = sortedPrizes(competition.prizes);
    const note = (competition.prizesNote ?? '').trim();
    return (
        <div className="space-y-5" data-testid="rules-panel">
            <section aria-labelledby="rules-title" className={cardPad}>
                <h2 id="rules-title" className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                    <ListChecks className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Rules
                </h2>
                {competition.rules.trim() ? <CtfMarkdown content={competition.rules} /> : <p className={`text-sm ${muted}`}>The organisers have not published rules. Play fair and do not attack the platform.</p>}
            </section>

            <section aria-labelledby="scoring-title" className={cardPad}>
                <h2 id="scoring-title" className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                    <Scale className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> How points work
                </h2>
                <ScoringExplainer mode={competition.scoringMode} teamsEnabled={competition.teamsEnabled} awardsPoints={competition.awardsPoints} />
            </section>

            {(prizes.length > 0 || note) && (
                <section aria-labelledby="prizes-title" className={cardPad} data-testid="prizes">
                    <h2 id="prizes-title" className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                        <Gift className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Prizes
                    </h2>
                    {prizes.length > 0 && (
                        <ol className="space-y-2">
                            {prizes.map((p) => (
                                <li key={p.place} className="flex items-baseline gap-3 text-sm">
                                    <span className="w-12 shrink-0 font-bold text-gray-900 dark:text-white">{placeLabel(p.place)}</span>
                                    <span className="min-w-0 break-words text-gray-800 dark:text-gray-200">{p.reward}</span>
                                </li>
                            ))}
                        </ol>
                    )}
                    {note && <div className={prizes.length > 0 ? 'mt-3' : ''}><CtfMarkdown content={note} /></div>}
                </section>
            )}
        </div>
    );
}

export default RulesPanel;
