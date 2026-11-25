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

const GitHubCallbackPage = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loginWithGithub } = useAuth();
    const [state, setState] = useState<CallbackState>('loading');
    const [error, setError] = useState<string | null>(null);
    // Where the member was heading before they left for GitHub (a same-site path, or null)
    const [returnTo, setReturnTo] = useState<string | null>(null);
    // A GitHub code works once: the exchange must run once per visit however often this page re-renders
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const target = takeOAuthReturn();
        setReturnTo(target);

        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');
        // The one-time code must not stay in the address bar or in history
        window.history.replaceState(window.history.state, '', window.location.pathname);
        if (errorParam) {
            setState('error');
            setError(providerErrorMessage(errorParam));
            return;
        }
        if (!code) {
            setState('error');
            setError('GitHub did not send an authorization code.');
            return;
        }

        loginWithGithub(code).then((challenge) => {
            if (challenge) {
                stashPending2fa(challenge.tempToken);
                router.replace(signInHref(target));
                return;
            }
            setState('success');
            // The effect below takes them on once their account has loaded
        }).catch((err) => {
            setState('error');
            setError(authErrorMessage(err, 'Authentication failed'));
        });
    }, [searchParams, loginWithGithub, router]);

    // A valid remembered page wins; a new account goes through the welcome flow; everyone else to their profile
    const next = user ? landingPath(user, returnTo) : undefined;
    useEffect(() => {
        if (state !== 'success' || !next) return;
        const timer = setTimeout(() => router.replace(next), 800);
        return () => clearTimeout(timer);
    }, [state, next, router]);

    return <CallbackStatus provider="GitHub" state={state} message={error} continueHref={state === 'success' ? next : undefined} signInHref={signInHref(returnTo)} />;
};

export default GitHubCallbackPage;
