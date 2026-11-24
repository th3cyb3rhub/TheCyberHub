import { LINK_REL } from './display';

/**
 * A sanitiser for the HTML that `renderMarkdownSegments` produces, written as plain string work so
 * it gives the same answer on the server and in the browser (DOMPurify needs a window and cannot
 * run while the page is rendered on the server).
 *
 * It is an allowlist, not a blocklist. The renderer escapes all text before it adds markup, so a
 * literal `<` in its output is always a tag the renderer wrote. This filter rebuilds every tag it
 * keeps from scratch (a fixed set of tags, a fixed set of attributes, checked values), and escapes
 * everything else. For lab content, only http and https links are kept, and a remote image becomes
 * a plain link: nothing is fetched just because an author wrote it.
 */

const TAGS = new Set(['p', 'br', 'strong', 'em', 'del', 'code', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'hr', 'img']);
const VOID = new Set(['br', 'hr', 'img']);
// Letters, digits, spaces and the characters of utility class names such as `hover:text-white` or `bg-white/10`
const CLASS_VALUE = /^[\w\s:/.\-[\]]{0,200}$/;
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z][a-zA-Z0-9-]*(?:="[^"<>]*")?)*)\s*(\/?)>/g;
const ATTR_RE = /([a-zA-Z][a-zA-Z0-9-]*)(?:="([^"<>]*)")?/g;

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (value: string) => value.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]);
const escapeAttr = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const escapeText = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** An http(s) address with no control characters or spaces, no credentials and a host, else null */
export function httpUrl(value: string | undefined): string | null {
    if (!value) return null;
    const url = decode(value).trim();
    if (/[\u0000-\u001f\u007f\s]/.test(url)) return null;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        if (!parsed.hostname || parsed.username || parsed.password) return null;
        return url;
    } catch {
        return null;
    }
}

function attributes(raw: string): Record<string, string> {
    const found: Record<string, string> = {};
    for (const m of Array.from(raw.matchAll(ATTR_RE))) found[m[1].toLowerCase()] = m[2] ?? '';
    return found;
}

const classAttr = (value: string | undefined) => (value && CLASS_VALUE.test(decode(value)) ? ` class="${escapeAttr(decode(value))}"` : '');
const link = (href: string, className: string | undefined) => `<a href="${escapeAttr(href)}"${classAttr(className)} target="_blank" rel="${LINK_REL}">`;

export function sanitizeLabHtml(html: string): string {
    let out = '';
    let last = 0;
    // For each open <a>: did we keep it? Its closing tag follows the same answer.
    const anchors: boolean[] = [];

    for (const m of Array.from(html.matchAll(TAG_RE))) {
        const index = m.index ?? 0;
        out += escapeText(html.slice(last, index));
        last = index + m[0].length;

        const closing = m[1] === '/';
        const name = m[2].toLowerCase();
        if (!TAGS.has(name)) continue; // an unknown tag is dropped; its text content stays as text

        if (closing) {
            if (name === 'a') {
                if (anchors.pop()) out += '</a>';
            } else if (!VOID.has(name)) out += `</${name}>`;
            continue;
        }

        const attrs = attributes(m[3]);
        if (name === 'a') {
            const href = httpUrl(attrs.href);
            anchors.push(!!href);
            if (href) out += link(href, attrs.class);
        } else if (name === 'img') {
            // No remote images: show the picture as a link to it, with its description
            const src = httpUrl(attrs.src);
            if (src) {
                const label = attrs.alt ? attrs.alt : src;
                out += `${link(src, undefined)}${escapeText(label)}</a>`;
            } else if (attrs.alt) {
                out += escapeText(attrs.alt);
            }
        } else if (VOID.has(name)) {
            out += `<${name} />`;
        } else {
            out += `<${name}${classAttr(attrs.class)}>`;
        }
    }
    out += escapeText(html.slice(last));
    // An anchor left open is closed, so markup after it cannot end up inside the link
    for (const kept of anchors) if (kept) out += '</a>';
    return out;
}
