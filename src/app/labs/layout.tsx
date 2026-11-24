import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Labs',
    description: 'Guided cybersecurity exercises: read the brief, work on the target in your own tools and submit the flag you find. Hints, points and a leaderboard.',
    openGraph: {
        title: 'Cybersecurity Labs | TheCyberHub',
        description: 'Guided flag exercises for practicing web security, forensics, cryptography and more.',
        type: 'website',
    },
}

export default function LabsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
