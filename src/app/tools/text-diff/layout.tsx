import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('text-diff')

export default function TextDiffLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
