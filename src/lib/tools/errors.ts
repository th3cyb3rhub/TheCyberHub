import { ApiError } from '@/lib/api';

/**
 * What the visitor reads, and what the page can offer, for each way a tools call can fail.
 * The API's message is only the last fallback so a new code never shows a blank box.
 */
export type ToolErrorKind =
    | 'validation'
    | 'login'
    | 'verify'
    | 'suspended'
    | 'not_found'
    | 'blocked'
    | 'unreachable'
    | 'opted_out'
    | 'not_supported'
    | 'rate_limited'
    | 'disabled'
    | 'busy'
    | 'upstream'
    | 'timeout'
    | 'network'
    | 'unknown';

export interface ToolErrorInfo {
    kind: ToolErrorKind;
    code?: string;
    title: string;
    message: string;
    /** The message without any "try again in" sentence, for a screen that counts the wait down itself */
    body: string;
    /** Seconds until a retry can work, when the API says so */
    retryAfter?: number;
    /** TOOL_RATE_LIMITED scope: minute, hour, target, concurrency, network or user_daily */
    scope?: string;
    /** TOOL_DISABLED, TOOL_TARGET_BLOCKED and similar reason code */
    reason?: string;
}

export const BLOCKED_REASONS: Record<string, string> = {
    bad_scheme: 'Only http and https addresses can be checked.',
    userinfo: 'Addresses with a user name or password in them are not allowed.',
    blocked_port: 'That port is not allowed. Web checks use 80, 443, 8080 and 8443.',
    invalid_url: 'That is not a valid address.',
    invalid_hostname: 'That is not a valid host name.',
    blocked_hostname: 'That name points at an internal or reserved host.',
    unspecified: 'That is an unspecified address (0.0.0.0 or ::).',
    private: 'That is a private network address.',
    cgnat: 'That is a shared carrier-grade NAT address.',
    loopback: 'That is a loopback address (this machine).',
    link_local: 'That is a link-local address.',
    metadata: 'That is a cloud metadata address.',
    reserved: 'That address range is reserved.',
    documentation: 'That address is reserved for documentation.',
    benchmarking: 'That address range is reserved for benchmarking.',
    multicast: 'That is a multicast address.',
    ipv4_mapped: 'That is an IPv4 address written in IPv6 form.',
    nat64: 'That is a NAT64 translation address.',
    invalid_ip: 'That is not a valid IP address.',
};

const DISABLED_REASONS: Record<string, string> = {
    master_off: 'The security tools are switched off for now.',
    active_off: 'Tools that connect to a target are not switched on in this environment yet.',
    kill_switch: 'This tool is switched off by the site operators.',
    admin_off: 'An administrator has paused this tool.',
    daily_cap: 'This tool has reached its daily limit. It resets at 00:00 UTC.',
    counters_unavailable: 'This tool is paused while its usage counters are unavailable.',
};

/** Why a tool is switched off, from the API's reason code */
export function disabledMessage(reason: string | null | undefined): string {
    return (reason && DISABLED_REASONS[reason]) || 'It is temporarily unavailable. Try again later.';
}

const UNREACHABLE_REASONS: Record<string, string> = {
    timeout: 'The target did not answer in time.',
    connect_timeout: 'The target did not accept a connection in time.',
    connection_refused: 'The target refused the connection.',
    connection_failed: 'The target could not be reached.',
    connection_reset: 'The target closed the connection.',
    tls_error: 'The target did not complete a TLS handshake.',
    too_many_redirects: 'The target redirected too many times.',
    bad_response: 'The target sent a response that could not be read.',
    response_too_large: 'The target response was too large.',
    no_certificate: 'The target did not present a certificate.',
    dns_failed: 'The name does not resolve.',
    dns_timeout: 'The name did not resolve in time.',
    nxdomain: 'The name does not exist.',
};

/** Whole seconds as "42 seconds", "3 minutes" or "1 hour 5 minutes" */
export function formatWait(seconds: number): string {
    const s = Math.max(1, Math.ceil(seconds));
    if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
    const minutes = Math.ceil(s / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours} hour${hours === 1 ? '' : 's'}${rest ? ` ${rest} minute${rest === 1 ? '' : 's'}` : ''}`;
}

const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined);
const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

const RATE_SCOPES: Record<string, string> = {
    minute: 'You have run this tool too many times in the last minute.',
    hour: 'You have reached the hourly limit for this tool.',
    target: 'This target has been checked too often by everyone together.',
    concurrency: 'A run of yours is still going. Wait for it to finish.',
    network: 'Too many checks have come from your network for this tool. This limit is shared and is not a ban.',
    user_daily: 'You have used your share of this tool for today. It resets at 00:00 UTC.',
};

const WAIT_SENTENCE = /\s*Try again in [^.]*\.$/;

export function toolErrorInfo(err: unknown): ToolErrorInfo {
    const info = buildToolErrorInfo(err);
    return { ...info, body: info.message.replace(WAIT_SENTENCE, '') };
}

function buildToolErrorInfo(err: unknown): Omit<ToolErrorInfo, 'body'> {
    if (!(err instanceof ApiError)) {
        // fetch rejects with a TypeError when the API cannot be reached at all
        if (err instanceof TypeError || (err instanceof Error && /fetch|network/i.test(err.message))) {
            return { kind: 'network', title: 'Could not reach the server', message: 'Check your connection and try again.' };
        }
        return { kind: 'unknown', title: 'Something went wrong', message: err instanceof Error && err.message ? err.message : 'Please try again.' };
    }

    const meta = err.meta ?? {};
    const retryAfter = num(meta.retryAfter);
    const reason = str(meta.reason);
    const scope = str(meta.scope);
    const base = { code: err.code, retryAfter, scope, reason };

    switch (err.code) {
        case 'VALIDATION_ERROR': {
            const detail = err.details?.map((d) => d.message).join(' ');
            return { ...base, kind: 'validation', title: 'Check the input', message: detail || err.message || 'The input was not accepted.' };
        }
        case 'AUTH_TOKEN_INVALID':
            return { ...base, kind: 'login', title: 'Sign in to run this tool', message: 'This tool connects to a target for you, so it needs a signed-in account.' };
        case 'AUTH_EMAIL_NOT_VERIFIED':
            return { ...base, kind: 'verify', title: 'Verify your e-mail address', message: 'Confirm your e-mail address to run tools that connect to a target. Check your inbox for the link.' };
        case 'TOOL_SUSPENDED':
            return { ...base, kind: 'suspended', title: 'Tool access paused', message: `Your access to active tools is paused after repeated attempts at private or internal addresses.${retryAfter ? ` Try again in ${formatWait(retryAfter)}.` : ''}` };
        case 'TOOL_NOT_FOUND':
            return { ...base, kind: 'not_found', title: 'Nothing found', message: err.message && err.message !== 'Nothing found' ? err.message : 'No result for that input.' };
        case 'TOOL_TARGET_BLOCKED':
            return { ...base, kind: 'blocked', title: 'Target not allowed', message: (reason && BLOCKED_REASONS[reason]) || str(meta.description) || 'This tool will not contact that target.' };
        case 'TOOL_TARGET_UNREACHABLE':
            return { ...base, kind: 'unreachable', title: 'Target did not answer', message: (reason && UNREACHABLE_REASONS[reason]) || 'The target is public but could not be reached.' };
        case 'TOOL_TARGET_OPTED_OUT':
            return { ...base, kind: 'opted_out', title: 'Target opted out', message: 'The owner of this domain has asked not to be checked by this tool, or an administrator blocked it.' };
        case 'TOOL_NOT_SUPPORTED':
            return { ...base, kind: 'not_supported', title: 'Not supported', message: err.message || 'This tool cannot answer that.' };
        case 'TOOL_RATE_LIMITED':
            return {
                ...base,
                kind: 'rate_limited',
                title: 'Rate limit reached',
                message: `${(scope && RATE_SCOPES[scope]) || 'You have reached a limit for this tool.'}${retryAfter && scope !== 'concurrency' ? ` Try again in ${formatWait(retryAfter)}.` : ''}`,
            };
        case 'TOOL_DISABLED':
            return {
                ...base,
                kind: 'disabled',
                title: 'Tool unavailable',
                message: reason ? disabledMessage(reason) : 'This tool is temporarily unavailable.',
            };
        case 'TOOL_UPSTREAM_BUSY':
            return { ...base, kind: 'busy', title: 'Data source is busy', message: `The public data source is busy.${retryAfter ? ` Try again in ${formatWait(retryAfter)}.` : ' Try again shortly.'}` };
        case 'TOOL_UPSTREAM_ERROR':
            return { ...base, kind: 'upstream', title: 'Data source problem', message: 'The public data source did not answer correctly. This is not a result. Try again later.' };
        case 'TOOL_UPSTREAM_TIMEOUT':
            return { ...base, kind: 'timeout', title: 'Timed out', message: 'The run took longer than the server allows (about 45 seconds) and was stopped. Try again, or try a smaller target.' };
        default:
            break;
    }

    if (err.status === 401) return { ...base, kind: 'login', title: 'Sign in to run this tool', message: 'This tool needs a signed-in account.' };
    if (err.status === 429) return { ...base, kind: 'rate_limited', title: 'Rate limit reached', message: `You are going too fast.${retryAfter ? ` Try again in ${formatWait(retryAfter)}.` : ' Try again in a minute.'}` };
    if (err.status >= 500) return { ...base, kind: 'upstream', title: 'Server problem', message: 'The server could not finish this request. Try again later.' };
    return { ...base, kind: 'unknown', title: 'Request failed', message: err.message || 'Please try again.' };
}

/** One line for a toast or a list: the title and the message */
export function toolErrorMessage(err: unknown): string {
    const info = toolErrorInfo(err);
    return `${info.title}. ${info.message}`;
}

/** A failed run that can be tried again with the same input once the wait is over */
export function isRetryable(info: ToolErrorInfo): boolean {
    return ['rate_limited', 'busy', 'timeout', 'upstream', 'network', 'unreachable', 'suspended'].includes(info.kind)
        || (info.kind === 'disabled' && info.reason === 'daily_cap');
}
