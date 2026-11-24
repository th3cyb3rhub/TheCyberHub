'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { isReviewerOnly } from '@/lib/jobs/roles';

/** A link to post a job, left out for a moderator, who reviews jobs but cannot post them */
export function PostJobLink({ className, children, href = '/employer/post' }: { className?: string; children: ReactNode; href?: string }) {
    const { user } = useAuth();
    if (isReviewerOnly(user?.role)) return null;
    return <Link href={href} className={className}>{children}</Link>;
}
