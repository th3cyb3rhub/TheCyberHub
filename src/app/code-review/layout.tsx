import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Code Review',
    description: 'Read vulnerable code and mark the lines that are wrong. The server grades your marks, explains the findings and pays points for your first pass.',
    openGraph: {
        title: 'Secure Code Review Exercises | TheCyberHub',
        description: 'Find the vulnerable lines in real-looking code. Graded on the server, with hints and a solution after your first attempt.',
        type: 'website',
    },
}

export default function CodeReviewLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
