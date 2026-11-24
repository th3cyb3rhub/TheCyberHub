import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('ssl-checker')

export default function SSLCheckerLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
