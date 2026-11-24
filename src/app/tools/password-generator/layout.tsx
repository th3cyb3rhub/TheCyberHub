import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('password-generator')

export default function PasswordGeneratorLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
