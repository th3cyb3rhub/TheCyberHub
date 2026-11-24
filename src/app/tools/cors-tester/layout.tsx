import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('cors-tester')

export default function CORSTesterLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
