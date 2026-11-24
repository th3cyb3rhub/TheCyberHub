import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('sql-injection')

export default function SQLInjectionLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
