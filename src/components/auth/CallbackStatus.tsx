import Link from 'next/link';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { btnPrimary, btnSecondary, card, heading, muted } from '@/components/events/styles';

export type CallbackState = 'loading' | 'success' | 'error';

/** What an OAuth callback page shows: the sign-in being completed, done, or failed with a way back. */
export function CallbackStatus({ provider, state, message, continueHref, signInHref }: {
    provider: 'Google' | 'GitHub';
    state: CallbackState;
    /** The reason, for an error */
    message?: string | null;
    /** Where a signed-in member goes next, for the manual link under the success note */
    continueHref?: string;
    /** The sign-in page to go back to on an error (keeps the page the member was heading for) */
    signInHref: string;
}) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-black">
            <div className={`${card} w-full max-w-sm p-8 text-center`}>
                {state === 'loading' && (
                    <div role="status" aria-live="polite">
                        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-orange-600 dark:text-orange-500" aria-hidden="true" />
                        <h1 className={`mb-2 text-xl font-semibold ${heading}`}>Signing in with {provider}</h1>
                        <p className={`text-sm ${muted}`}>Please wait while we complete your sign-in.</p>
                    </div>
                )}

                {state === 'success' && (
                    <div role="status" aria-live="polite">
                        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-green-700 dark:text-green-500" aria-hidden="true" />
                        <h1 className={`mb-2 text-xl font-semibold ${heading}`}>You are signed in</h1>
                        <p className={`text-sm ${muted}`}>Taking you on.</p>
                        {continueHref && <Link href={continueHref} className={`${btnPrimary} mt-5`}>Continue</Link>}
                    </div>
                )}

                {state === 'error' && (
                    <div role="alert">
                        <XCircle className="mx-auto mb-4 h-10 w-10 text-red-700 dark:text-red-500" aria-hidden="true" />
                        <h1 className={`mb-2 text-xl font-semibold ${heading}`}>Sign-in with {provider} failed</h1>
                        <p className="mb-6 text-sm text-red-700 dark:text-red-400">{message || 'Authentication failed'}</p>
                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                            <Link href={signInHref} className={btnPrimary}>Back to sign in</Link>
                            <Link href="/" className={btnSecondary}>Go home</Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/** What a callback shows for the reason a provider sent back in the URL: never the raw text, which anyone can put in a link. */
export function providerErrorMessage(error: string | null): string {
    return error === 'access_denied' ? 'You cancelled the sign-in, or the provider denied access.' : 'The provider could not complete the sign-in.';
}
