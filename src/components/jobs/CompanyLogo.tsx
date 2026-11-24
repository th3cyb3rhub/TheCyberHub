import Image from 'next/image';
import { Building2 } from 'lucide-react';
import { safeHref } from '@/lib/jobs/display';

const SIZES = { sm: 'h-10 w-10', md: 'h-14 w-14', lg: 'h-20 w-20' } as const;
const PX = { sm: 40, md: 56, lg: 80 } as const;

/** A company logo from a link the poster gave: shown only when it is http or https, else a plain building */
export function CompanyLogo({ src, name, size = 'md', className = '' }: { src?: string | null; name: string; size?: keyof typeof SIZES; className?: string }) {
    const href = safeHref(src);
    return (
        <div className={`flex ${SIZES[size]} shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 ${className}`}>
            {href ? (
                <Image src={href} alt={`${name} logo`} width={PX[size]} height={PX[size]} className="h-full w-full object-contain p-1" unoptimized />
            ) : (
                <Building2 className="h-1/2 w-1/2 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            )}
        </div>
    );
}
