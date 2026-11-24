import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('encoder-decoder')

export default function EncoderDecoderLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
