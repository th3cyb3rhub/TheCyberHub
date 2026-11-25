import { EditSnippetView } from '@/components/code-review/EditorPages';

export default async function EditCodeReviewPage({ params }: { params: Promise<{ ref: string }> }) {
    const { ref } = await params;
    return <EditSnippetView slug={ref} />;
}
