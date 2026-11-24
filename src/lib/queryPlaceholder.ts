/**
 * Placeholder data for a key that changed (another filter, another page): the previous answer, but
 * only when it was asked by the same viewer. After a sign-in, a sign-out or an account switch the
 * previous answer belongs to somebody else (a draft, a staff only board), so it is never shown.
 * `at` is where the user id sits in the query key.
 */
export function placeholderForViewer<T>(userId: string | null, at: number) {
    return (previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }): T | undefined => (
        previousQuery && previousQuery.queryKey[at] === userId ? previous : undefined
    );
}
