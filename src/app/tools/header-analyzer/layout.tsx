import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('header-analyzer')

export default function HeaderAnalyzerLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
