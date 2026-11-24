import { hostOf, mailtoHref, safeHref } from './display';
import type { ApplyDetails } from '@/types/job';

/** Where "Apply" leads, decided from what the API returned (never from the page's own copy) */
export type ApplyTarget =
    | { kind: 'url'; href: string; host: string }
    | { kind: 'email'; href: string; address: string }
    | { kind: 'none' };

/**
 * The link to open: the apply link when it is http or https, else a mailto link to the apply
 * address when it is an address, else nothing. A `javascript:` or `data:` link is never followed,
 * even though the API is expected to refuse them.
 */
export function applyTarget(details: Partial<ApplyDetails> | null | undefined, title?: string): ApplyTarget {
    const url = safeHref(details?.applyUrl);
    if (url) return { kind: 'url', href: url, host: hostOf(url) };
    const mail = mailtoHref(details?.applyEmail, title);
    if (mail && details?.applyEmail) return { kind: 'email', href: mail, address: details.applyEmail };
    return { kind: 'none' };
}

/**
 * Open an outbound link in a new tab without giving the other site a handle on this one
 * (`noopener`) or the address of this page (`noreferrer`). Returns false when the link is not a
 * plain http(s) link or the browser has no window to open it in.
 */
export function openOutbound(href: string, open: Pick<Window, 'open'> | null = typeof window === 'undefined' ? null : window): boolean {
    if (!open || !safeHref(href)) return false;
    open.open(href, '_blank', 'noopener,noreferrer');
    return true;
}
