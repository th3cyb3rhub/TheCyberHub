import type { Metadata } from 'next';
import { excerpt } from '@/lib/labs/display';
import type { CtfCompetition, CtfResults } from '@/types/ctf';
import { SITE_URL } from '@/lib/events/site';

/** Kept out of search results and link crawlers */
const NO_INDEX: Metadata['robots'] = { index: false, follow: false };

/** A competition that is link only (`isPublic` false) must not be indexed or given a canonical address */
export const isUnlisted = (competition: { isPublic?: boolean } | null | undefined): boolean => competition?.isPublic === false;

/** The metadata of a competition page. A draft, an unknown slug or a failing API passes `null`. */
/** A failing API (`outage`) says nothing about indexing: only a competition that is known to be hidden is kept out of search */
export function competitionMetadata(competition: CtfCompetition | null, outage = false): Metadata {
    if (!competition) return outage ? { title: 'Competition' } : { title: 'Competition', robots: NO_INDEX };
    if (isUnlisted(competition)) return { title: competition.title, robots: NO_INDEX };

    const description = excerpt(competition.shortDescription || competition.description, 160) || `${competition.title}: a capture the flag competition on TheCyberHub.`;
    const url = `${SITE_URL}/ctf/competitions/${competition.slug}`;
    return {
        title: competition.title,
        description,
        alternates: { canonical: url },
        openGraph: {
            title: `${competition.title} | TheCyberHub CTF`,
            description,
            url,
            type: 'website',
            siteName: 'TheCyberHub',
            images: [{ url: '/img.png', width: 1200, height: 630, alt: 'TheCyberHub' }],
        },
        twitter: { card: 'summary_large_image', title: competition.title, description, images: ['/twitter-image.png'] },
    };
}

/**
 * The metadata of a results page. `results` is null when there are none to show (not ended, a draft,
 * a failing API); `unlisted` says the competition is link only, however it was learnt.
 */
export function resultsMetadata(results: CtfResults | null, unlisted: boolean, outage = false): Metadata {
    if (!results) return outage ? { title: 'Results' } : { title: 'Results', robots: { index: false, follow: true } };
    const { competition } = results;
    if (unlisted || isUnlisted(competition)) return { title: `${competition.title}: results`, robots: NO_INDEX };

    const url = `${SITE_URL}/ctf/competitions/${competition.slug}/results`;
    const winner = results.podium[0];
    const name = winner ? ('teamName' in winner ? String(winner.teamName) : String(winner.username)) : null;
    const description = name
        ? `Final results of ${competition.title}: ${name} won. Podium, standings and first bloods.`
        : `Final results of ${competition.title}.`;
    return {
        title: `${competition.title}: results`,
        description,
        alternates: { canonical: url },
        openGraph: { title: `${competition.title}: results | TheCyberHub CTF`, description, url, type: 'website', siteName: 'TheCyberHub' },
    };
}
