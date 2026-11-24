import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('xss-payloads')

export default function XSSPayloadsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
