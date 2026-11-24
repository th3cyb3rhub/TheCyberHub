import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('ssrf-tester')

export default function SSRFTesterLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
