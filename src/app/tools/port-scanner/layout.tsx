import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('port-scanner')

export default function PortScannerLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
