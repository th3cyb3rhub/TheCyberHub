"use client"

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { CallbackStatus, providerErrorMessage, type CallbackState } from '@/components/auth/CallbackStatus';
import { landingPath } from '@/lib/landingPath';
import { takeOAuthReturn } from '@/lib/oauthReturn';
import { stashPending2fa } from '@/lib/pending2fa';
import { signInHref } from '@/lib/safeRedirect';
import { authErrorMessage } from '@/lib/authErrors';

const GoogleCallbackPage = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loginWithGoogle } = useAuth();
    const [state, setState] = useState<CallbackState>('loading');
    const [error, setError] = useState<string | null>(null);
    // Where the member was heading before they left for Google (a same-site path, or null)
    const [returnTo, setReturnTo] = useState<string | null>(null);
    // The sign-in must be sent once per visit however often this page re-renders
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const target = takeOAuthReturn();
        setReturnTo(target);

        const fail = (message: string) => { setState('error'); setError(message); };

        const errorParam = searchParams.get('error');
        if (errorParam) return fail(providerErrorMessage(errorParam));

        // Google returns the token in the URL hash (implicit flow) or as a credential (One Tap)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const idToken = hashParams.get('id_token') || hashParams.get('access_token') || searchParams.get('credential');
        // The token must not stay in the address bar or in history: Back would run this page again with it
        window.history.replaceState(window.history.state, '', window.location.pathname);
        if (!idToken) return fail('Google did not send a sign-in token.');

        loginWithGoogle(idToken).then((challenge) => {
            if (challenge) {
                stashPending2fa(challenge.tempToken);
                router.replace(signInHref(target));
                return;
            }
            setState('success');
            // The effect below takes them on once their account has loaded
        }).catch((err) => fail(authErrorMessage(err, 'Authentication failed')));
    }, [searchParams, loginWithGoogle, router]);

    // A valid remembered page wins; a new account goes through the welcome flow; everyone else to their profile
    const next = user ? landingPath(user, returnTo) : undefined;
    useEffect(() => {
        if (state !== 'success' || !next) return;
        const timer = setTimeout(() => router.replace(next), 800);
        return () => clearTimeout(timer);
    }, [state, next, router]);

    return <CallbackStatus provider="Google" state={state} message={error} continueHref={state === 'success' ? next : undefined} signInHref={signInHref(returnTo)} />;
};

export default GoogleCallbackPage;
