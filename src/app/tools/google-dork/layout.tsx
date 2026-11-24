import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('google-dork')

export default function GoogleDorkLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
