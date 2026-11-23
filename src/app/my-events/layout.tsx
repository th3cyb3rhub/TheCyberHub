import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'My Events | TheCyberHub',
    description: 'View and manage the cybersecurity events you have registered for on TheCyberHub.',
    robots: { index: false, follow: false },
}

export default function MyEventsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
