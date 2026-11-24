import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('dns-lookup')

export default function DNSLookupLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
