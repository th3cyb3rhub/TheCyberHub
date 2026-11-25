import { IntentLink } from '@/components/ui/IntentLink';
import Image from 'next/image';
import { Award, Gift, Layers, Star, Swords, Trophy, Users } from 'lucide-react';
import { card, focusRing, muted } from '@/components/events/styles';
import { formatRange } from '@/lib/events/time';
import { excerpt, participantsText, prizeSummary, safeHref } from '@/lib/ctf/display';
import type { CtfCompetitionCard, CtfStatus } from '@/types/ctf';
import { CtfStatusBadge, Pill } from './Badges';

/**
 * One competition in the list. No hooks, so the server can render it too. The title link covers the
 * card. Dates are in the competition's own zone and say which one it is.
 */
export function CompetitionCard({ competition, status, featured = false }: { competition: CtfCompetitionCard; status?: CtfStatus; featured?: boolean }) {
    const shown = status ?? competition.status;
    const summary = competition.shortDescription?.trim() || excerpt(competition.description, 160);
    const prizes = prizeSummary(competition);
    const image = safeHref(competition.image);
    return (
        <article
            className={`${card} relative flex flex-col overflow-hidden transition-colors focus-within:ring-2 focus-within:ring-orange-500 hover:border-orange-400 dark:hover:border-orange-500/60 ${featured ? 'md:flex-row' : ''}`}
            data-testid="ctf-card"
            data-slug={competition.slug}
            data-status={shown}
            data-featured={competition.isFeatured || undefined}
        >
            {image && (
                <div className={`relative w-full shrink-0 bg-gray-100 dark:bg-neutral-800 ${featured ? 'h-40 md:h-auto md:w-2/5' : 'h-32'}`}>
                    <Image src={image} alt="" fill sizes={featured ? '(min-width: 768px) 40vw, 100vw' : '(min-width: 1024px) 33vw, 100vw'} className="object-cover" unoptimized />
                </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                    <CtfStatusBadge status={shown} />
                    {competition.isFeatured && <Pill icon={Star}>Featured</Pill>}
                    <Pill icon={competition.teamsEnabled ? Users : Swords}>{competition.teamsEnabled ? `Teams, up to ${competition.maxTeamSize}` : 'Solo'}</Pill>
                </div>
                <div className="min-w-0">
                    <h2 className={`break-words font-semibold leading-snug text-gray-900 dark:text-white ${featured ? 'text-xl' : 'text-base'}`}>
                        <IntentLink href={`/ctf/competitions/${competition.slug}`} className={`rounded after:absolute after:inset-0 after:rounded-2xl ${focusRing} focus-visible:ring-0 focus-visible:ring-offset-0`}>{competition.title}</IntentLink>
                    </h2>
                    <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200" data-testid="card-dates">{formatRange(competition, competition.timezone, { withYear: true })}</p>
                    <p className={`text-xs ${muted}`}>Time zone: {competition.timezone}</p>
                </div>
                {summary && <p className={`line-clamp-3 text-sm ${muted}`}>{summary}</p>}
                <ul className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-700 dark:border-neutral-800 dark:text-gray-300" aria-label="Competition details">
                    <li className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" /> {participantsText(competition)}</li>
                    <li className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" aria-hidden="true" /> {competition.challengeCount} {competition.challengeCount === 1 ? 'challenge' : 'challenges'}</li>
                    <li className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5" aria-hidden="true" /> {competition.scoringMode === 'dynamic' ? 'Dynamic points' : 'Static points'}</li>
                    {competition.awardsPoints && <li className="inline-flex items-center gap-1"><Award className="h-3.5 w-3.5" aria-hidden="true" /> Global points</li>}
                    {prizes && <li className="inline-flex min-w-0 items-center gap-1"><Gift className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span className="truncate" data-testid="card-prizes">{prizes}</span></li>}
                </ul>
            </div>
        </article>
    );
}
