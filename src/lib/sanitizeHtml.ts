import DOMPurify from 'dompurify';

/**
 * The one way to clean HTML before it goes into `dangerouslySetInnerHTML`.
 *
 * DOMPurify needs a window. While a page is rendered on the server it has none and has no `sanitize`
 * function, so a call there used to crash the render. Here the server gets an empty string instead:
 * markup is never passed on unsanitised. Callers whose HTML is only known in the browser (typed in,
 * fetched by the browser) render the same empty string on the server and in the first client render,
 * so nothing mismatches; HTML that must be in the server's markup needs a sanitiser that also runs on
 * the server (see `lib/labs/sanitize.ts`).
 */
export function sanitizeHtml(html: string, config?: Parameters<typeof DOMPurify.sanitize>[1]): string {
    if (!html) return '';
    if (!DOMPurify.isSupported) return '';
    return String(DOMPurify.sanitize(html, config));
}
