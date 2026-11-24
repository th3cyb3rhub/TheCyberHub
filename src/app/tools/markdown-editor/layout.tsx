import { toolMetadata } from '@/lib/tools/metadata'

export const metadata = toolMetadata('markdown-editor')

export default function MarkdownEditorLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
