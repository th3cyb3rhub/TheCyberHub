import Link from 'next/link';
import { BookOpen, Flag, Home, LayoutDashboard, Map, Search, Wrench } from 'lucide-react';
import { GoBackButton, SearchSiteButton } from '@/components/NotFoundActions';

// A server component inside the root layout: the navbar and the theme come with it. Only the two
// buttons that need the browser are client components.
const quick = 'flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-all hover:bg-gray-200 hover:text-gray-900 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white';

export default function NotFound() {
    return (
        <div className="relative flex min-h-screen items-center justify-center bg-white px-4 dark:bg-black">
            {/* Background effects */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute left-1/2 top-1/4 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-orange-500/10 blur-[150px]" />
                <div className="absolute bottom-0 right-0 h-[300px] w-[400px] rounded-full bg-red-500/5 blur-[100px]" />
            </div>

            <div className="relative max-w-lg text-center">
                {/* 404 Number */}
                <div className="relative mb-8" aria-hidden="true">
                    <p className="select-none text-[150px] font-bold leading-none text-gray-900/5 sm:text-[200px] dark:text-white/5">404</p>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-24 w-24 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 shadow-2xl shadow-orange-500/20 motion-reduce:animate-none">
                            <Search className="h-12 w-12 text-white" />
                        </div>
                    </div>
                </div>

                <h1 className="mb-4 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">Page Not Found</h1>
                <p className="mx-auto mb-8 max-w-md text-gray-600 dark:text-gray-400">
                    The page you&apos;re looking for doesn&apos;t exist or has been moved. Let&apos;s get you back on track.
                </p>

                <div className="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Link
                        href="/"
                        className="flex items-center gap-2 rounded-xl bg-orange-700 px-6 py-3 font-medium text-white transition-all duration-300 hover:bg-orange-800 hover:shadow-lg hover:shadow-orange-500/25"
                    >
                        <Home className="h-4 w-4" aria-hidden="true" />
                        Go Home
                    </Link>
                    <GoBackButton />
                </div>

                <div className="border-t border-gray-200 pt-8 dark:border-white/10">
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-500">Or explore these popular sections:</p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <Link href="/tools" className={quick}><Wrench className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />Security Tools</Link>
                        <Link href="/cheatsheets" className={quick}><BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />Cheatsheets</Link>
                        <Link href="/roadmaps" className={quick}><Map className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden="true" />Roadmaps</Link>
                        <Link href="/challenges" className={quick}><Flag className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden="true" />CTF Challenges</Link>
                        <Link href="/dashboard" className={quick}><LayoutDashboard className="h-4 w-4 text-orange-600 dark:text-orange-300" aria-hidden="true" />Dashboard</Link>
                    </div>
                    <SearchSiteButton />
                </div>

                <p className="mt-10 text-xs text-gray-600 dark:text-gray-500">Error 404 • This isn&apos;t the vulnerability you&apos;re looking for</p>
            </div>
        </div>
    );
}
