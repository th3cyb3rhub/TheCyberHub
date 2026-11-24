import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('ip-lookup')

export default function IPLookupLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
