import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Analytics } from "@vercel/analytics/next"
import ClientProviders from "@/components/ClientProviders";
import { themeInitScript } from '@/lib/theme';

const inter = Inter({
    subsets: ['latin'],
    display: 'swap',
    preload: true,
})

export const metadata: Metadata = {
    metadataBase: new URL('https://thecyberhub.org'),
    title: {
        default: 'TheCyberHub - Empowering Cybersecurity Experts',
        template: '%s | TheCyberHub'
    },
    description: 'Join the ultimate destination for cybersecurity enthusiasts to learn, connect, and grow together. Access security tools, cheatsheets, and expert resources.',
    keywords: [
        'cybersecurity',
        'penetration testing',
        'security tools',
        'JWT analyzer',
        'subdomain finder',
        'linux commands',
        'security cheatsheets',
        'ethical hacking',
        'vulnerability assessment',
        'security community',
    ],
    authors: [{ name: 'TheCyberHub Team', url: 'https://thecyberhub.org' }],
    creator: 'TheCyberHub',
    publisher: 'TheCyberHub',
    icons: {
        icon: '/favicon.ico',
    },
    openGraph: {
        type: 'website',
        locale: 'en_US',
        url: 'https://thecyberhub.org',
        title: 'TheCyberHub - Empowering Cybersecurity Experts',
        description: 'Join the ultimate destination for cybersecurity enthusiasts to learn, connect, and grow together.',
        siteName: 'TheCyberHub',
        images: [{ url: '/img.png', width: 1200, height: 630, alt: 'TheCyberHub' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'TheCyberHub - Empowering Cybersecurity Experts',
        description: 'Join the ultimate destination for cybersecurity enthusiasts.',
        images: ['/twitter-image.png'],
        creator: '@th3cyb3rhub',
    },
    robots: { index: true, follow: true },
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    themeColor: [
        { media: '(prefers-color-scheme: dark)', color: '#000000' },
        { media: '(prefers-color-scheme: light)', color: '#f1f5f9' },
    ],
}

// The server always renders the default (dark) theme. The script in <head> switches <html> to the
// stored or system theme before the first paint, so only <html> differs from the server markup.
export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <meta name="darkreader-lock" />
                <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
            </head>
            <body className={`${inter.className} cyberhub-bg`}>
                <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-500 focus:text-white focus:rounded"
                >
                    Skip to main content
                </a>
                <ClientProviders>
                    <div id="main-content">{children}</div>
                </ClientProviders>
                <Analytics />
            </body>
        </html>
    )
}
