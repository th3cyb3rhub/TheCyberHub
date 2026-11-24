import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('whois-lookup')

export default function WhoisLookupLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
