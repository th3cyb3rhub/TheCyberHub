import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('hash-analyzer')

export default function HashAnalyzerLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
