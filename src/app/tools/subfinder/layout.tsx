import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('subfinder')

export default function SubfinderLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
