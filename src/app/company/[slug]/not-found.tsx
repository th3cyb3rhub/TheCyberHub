import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { btnPrimary, muted, pageBg } from '@/components/events/styles';

export default function CompanyNotFound() {
    return (
        <div className={pageBg}>
            <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-32 text-center">
                <Building2 className="mb-4 h-10 w-10 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">Company not found</h1>
                <p className={`mb-6 text-sm ${muted}`}>This company page does not exist, or it is not public.</p>
                <Link href="/jobs" className={btnPrimary}>Browse jobs</Link>
            </div>
        </div>
    );
}
