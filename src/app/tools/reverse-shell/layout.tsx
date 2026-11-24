import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('reverse-shell')

export default function ReverseShellLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
