import { fetchMentorIdsForSitemap } from '@/lib/mentorship/server'
import { MetadataRoute } from 'next'
import { fetchSitemapRows } from '@/lib/learning/server'
import { FALLBACK_TOOLS, toolHref } from '@/lib/tools/registry'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// Define your static routes
const toolRoutes = FALLBACK_TOOLS.map((tool) => ({
    url: toolHref(tool.slug),
    changeFrequency: 'monthly' as const,
    priority: tool.popular ? 0.8 : 0.7,
}))

const staticRoutes = [
    {
        url: '',
        changeFrequency: 'daily' as const,
        priority: 1,
    },
    {
        url: '/challenges',
        changeFrequency: 'weekly' as const,
        priority: 0.9,
    },
    {
        url: '/blog',
        changeFrequency: 'daily' as const,
        priority: 0.8,
    },
    {
        url: '/tools',
        changeFrequency: 'monthly' as const,
        priority: 0.8,
    },
    {
        url: '/cheatsheets',
        changeFrequency: 'weekly' as const,
        priority: 0.9,
    },
    {
        url: '/cheatsheets/linux-commands',
        changeFrequency: 'monthly' as const,
        priority: 0.7,
    },
    {
        url: '/jobs',
        changeFrequency: 'daily' as const,
        priority: 0.9,
    },
    {
        url: '/forums',
        changeFrequency: 'daily' as const,
        priority: 0.8,
    },
    {
        url: '/community-guidelines',
        changeFrequency: 'yearly' as const,
        priority: 0.3,
    },
    {
        url: '/leaderboard',
        changeFrequency: 'daily' as const,
        priority: 0.7,
    },
    {
        url: '/badges',
        changeFrequency: 'weekly' as const,
        priority: 0.5,
    },
    {
        url: '/roadmaps',
        changeFrequency: 'weekly' as const,
        priority: 0.8,
    },
    {
        url: '/resources',
        changeFrequency: 'daily' as const,
        priority: 0.8,
    },
    {
        url: '/ctf',
        changeFrequency: 'weekly' as const,
        priority: 0.8,
    },
    {
        url: '/ctf/competitions',
        changeFrequency: 'daily' as const,
        priority: 0.8,
    },
    {
        url: '/search',
        changeFrequency: 'weekly' as const,
        priority: 0.5,
    },
    {
        url: '/feed',
        changeFrequency: 'daily' as const,
        priority: 0.7,
    },
    {
        url: '/employer',
        changeFrequency: 'weekly' as const,
        priority: 0.6,
    },
    {
        url: '/about',
        changeFrequency: 'monthly' as const,
        priority: 0.6,
    },
    {
        url: '/contact',
        changeFrequency: 'monthly' as const,
        priority: 0.5,
    },
    {
        url: '/privacy',
        changeFrequency: 'yearly' as const,
        priority: 0.3,
    },
    {
        url: '/terms',
        changeFrequency: 'yearly' as const,
        priority: 0.3,
    },

    {
        url: '/events',
        changeFrequency: 'daily' as const,
        priority: 0.8,
    },
    {
        url: '/mentorship',
        changeFrequency: 'weekly' as const,
        priority: 0.7,
    },
    {
        url: '/learning-paths',
        changeFrequency: 'weekly' as const,
        priority: 0.7,
    },

    {
        url: '/forgot-password',
        changeFrequency: 'monthly' as const,
        priority: 0.3,
    },
    {
        url: '/reset-password',
        changeFrequency: 'monthly' as const,
        priority: 0.3,
    },

    // CTF
    {
        url: '/ctf/challenges',
        changeFrequency: 'weekly' as const,
        priority: 0.7,
    },
    {
        url: '/ctf/leaderboard',
        changeFrequency: 'weekly' as const,
        priority: 0.7,
    },

    // Events (the list is above; event pages are added from the API)
    {
        url: '/events/calendar',
        changeFrequency: 'daily' as const,
        priority: 0.6,
    },
    {
        url: '/events/archive',
        changeFrequency: 'daily' as const,
        priority: 0.6,
    },

    // Internships
    {
        url: '/internships',
        changeFrequency: 'weekly' as const,
        priority: 0.5,
    },

    // Labs
    {
        url: '/labs',
        changeFrequency: 'weekly' as const,
        priority: 0.6,
    },

    // Code Review
    {
        url: '/code-review',
        changeFrequency: 'weekly' as const,
        priority: 0.5,
    },

    // Company
    {
        url: '/company',
        changeFrequency: 'monthly' as const,
        priority: 0.4,
    },

    // Tool pages come from the tools registry (see toolRoutes above)

    // Cheatsheets (individual pages)
    {
        url: '/cheatsheets/xss',
        changeFrequency: 'monthly' as const,
        priority: 0.7,
    },
    {
        url: '/cheatsheets/web-security',
        changeFrequency: 'monthly' as const,
        priority: 0.7,
    },
    {
        url: '/cheatsheets/sql-injection',
        changeFrequency: 'monthly' as const,
        priority: 0.7,
    },
    {
        url: '/cheatsheets/osint',
        changeFrequency: 'monthly' as const,
        priority: 0.7,
    },
    {
        url: '/cheatsheets/reverse-shells',
        changeFrequency: 'monthly' as const,
        priority: 0.7,
    },
    {
        url: '/cheatsheets/networking',
        changeFrequency: 'monthly' as const,
        priority: 0.7,
    },
    {
        url: '/cheatsheets/privesc',
        changeFrequency: 'monthly' as const,
        priority: 0.7,
    },
]

interface SitemapEvent { slug?: string; status?: string; startDate?: string; endsAt?: string }

const EVENT_PAGE_SIZE = 50
const EVENT_MAX_PAGES = 10
// A slow API must not hold up the sitemap: give up on events and list the rest
const EVENT_FETCH_TIMEOUT_MS = 5000

async function eventSitemapEntries(baseUrl: string): Promise<MetadataRoute.Sitemap> {
    const entries: MetadataRoute.Sitemap = []
    try {
        for (let page = 1; page <= EVENT_MAX_PAGES; page++) {
            const res = await fetch(`${API_URL}/api/events?scope=all&sort=-startDate&limit=${EVENT_PAGE_SIZE}&page=${page}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(EVENT_FETCH_TIMEOUT_MS) })
            if (!res.ok) break
            const body = await res.json()
            const events: SitemapEvent[] = body.data || []
            for (const event of events) {
                if (!event.slug || event.status === 'cancelled') continue
                const over = event.endsAt ? new Date(event.endsAt) < new Date() : false
                entries.push({
                    url: `${baseUrl}/events/${event.slug}`,
                    lastModified: event.startDate ? new Date(event.startDate) : new Date(),
                    changeFrequency: over ? 'monthly' : 'daily',
                    priority: over ? 0.4 : 0.7,
                })
            }
            if (!body.pagination?.hasMore) break
        }
    } catch {
        // The static pages are still listed
    }
    return entries
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://thecyberhub.org'
    const currentDate = new Date()

    // Static pages
    const staticPages = [...staticRoutes, ...toolRoutes].map(route => ({
        url: `${baseUrl}${route.url}`,
        lastModified: currentDate,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
    }))

    // Dynamic job pages
    let jobPages: MetadataRoute.Sitemap = []
    try {
        const res = await fetch(`${API_URL}/api/jobs?limit=50`, { next: { revalidate: 3600 } })
        if (res.ok) {
            const data = await res.json()
            const jobs = data.data || []
            jobPages = jobs.map((job: { slug?: string; _id: string; updatedAt?: string }) => ({
                url: `${baseUrl}/jobs/${job.slug || job._id}`,
                lastModified: job.updatedAt ? new Date(job.updatedAt) : currentDate,
                changeFrequency: 'weekly' as const,
                priority: 0.7,
            }))
        }
    } catch {
        // Silently fail — static pages still included
    }

    // Approved events: every public one except those that were cancelled
    const eventPages = await eventSitemapEntries(baseUrl)

    // Approved mentors. Private mentorship pages are never listed.
    const mentorPages: MetadataRoute.Sitemap = (await fetchMentorIdsForSitemap()).map((mentor) => ({
        url: `${baseUrl}/mentorship/mentor/${mentor.id}`,
        lastModified: mentor.updatedAt ? new Date(mentor.updatedAt) : currentDate,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
    }))

    // Published roadmaps, paths and approved resources. Drafts and anything private never appear in these lists.
    const [roadmaps, paths, resources] = await Promise.all([
        fetchSitemapRows('/api/learning-paths?kind=roadmap'),
        fetchSitemapRows('/api/learning-paths?kind=path'),
        fetchSitemapRows('/api/resources'),
    ])
    const learningPages: MetadataRoute.Sitemap = [
        ...roadmaps.map((r) => ({ url: `${baseUrl}/roadmaps/${r.slug}`, lastModified: r.updatedAt ? new Date(r.updatedAt) : currentDate, changeFrequency: 'weekly' as const, priority: 0.7 })),
        ...paths.map((r) => ({ url: `${baseUrl}/learning-paths/${r.slug}`, lastModified: r.updatedAt ? new Date(r.updatedAt) : currentDate, changeFrequency: 'weekly' as const, priority: 0.6 })),
        ...resources.map((r) => ({ url: `${baseUrl}/resources/${r.slug}`, lastModified: r.updatedAt ? new Date(r.updatedAt) : currentDate, changeFrequency: 'monthly' as const, priority: 0.5 })),
    ]

    return [...staticPages, ...jobPages, ...eventPages, ...mentorPages, ...learningPages]
}
