import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('jwt-analyzer')

export default function JWTAnalyzerLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
