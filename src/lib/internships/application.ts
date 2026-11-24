import { z } from 'zod';
import type { AnswerValue, ApplyPayload, CustomField } from '@/types/internship';

export const LIMITS = {
    coverLetterMin: 10,
    coverLetter: 3000,
    url: 2048,
    answerText: 500,
    answerTextarea: 3000,
    note: 1000,
    withdrawReason: 500,
} as const;

/** http or https, no credentials: the same links the API accepts */
export function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && !!url.hostname;
    } catch {
        return false;
    }
}

/** An IPv4 address in a private, loopback, link-local or otherwise non-public range */
function isPrivateIPv4(host: string): boolean {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!m) return false;
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/**
 * A link the API accepts: http(s), no credentials, a public-looking host (no localhost, private or
 * internal addresses) and at most 2048 characters. The API is the judge; this only saves a round trip.
 */
export function isPublicHttpUrl(value: string): boolean {
    if (value.length > 2048 || !isHttpUrl(value)) return false;
    const host = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
    if (host.startsWith('[') || host.includes(':')) return false; // IPv6 literals
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return false;
    if (isPrivateIPv4(host)) return false;
    return host.includes('.');
}

const optionalLink = (label: string) => z.string().trim().max(LIMITS.url, `${label} is too long`)
    .refine((v) => v === '' || isPublicHttpUrl(v), `${label} must be a public link that starts with http:// or https://`);

/** The fixed part of the application form */
export const applicationSchema = z.object({
    coverLetter: z.string().trim()
        .min(LIMITS.coverLetterMin, `Tell us a bit more: at least ${LIMITS.coverLetterMin} characters`)
        .max(LIMITS.coverLetter, `Cover letter cannot exceed ${LIMITS.coverLetter} characters`),
    githubUrl: optionalLink('GitHub link'),
    linkedinUrl: optionalLink('LinkedIn link'),
    portfolioUrl: optionalLink('Portfolio link'),
    resumeUrl: optionalLink('Resume link'),
});

export type ApplicationValues = z.input<typeof applicationSchema>;

export const emptyApplication = (): ApplicationValues => ({ coverLetter: '', githubUrl: '', linkedinUrl: '', portfolioUrl: '', resumeUrl: '' });

/** The same cleaning the API does: one line for `text`, line breaks kept for `textarea` */
export function cleanAnswer(value: string, type: CustomField['type']): string {
    const text = value.replace(/\r\n?/g, '\n');
    const noControl = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    return type === 'textarea' ? noControl.trim() : noControl.replace(/\s+/g, ' ').trim();
}

/**
 * Check the answers against the cohort's questions with the server's rules. Keys are
 * `answers.<fieldId>`, the same names the API uses in `details[].field`.
 */
export function validateAnswers(fields: CustomField[], values: Record<string, string>): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const field of fields) {
        const key = `answers.${field._id}`;
        const value = cleanAnswer(values[field._id] ?? '', field.type);
        if (!value) {
            if (field.required) errors[key] = `${field.label} is required`;
            continue;
        }
        if (field.type === 'dropdown') {
            if (!field.options.includes(value)) errors[key] = `${field.label} must be one of the options`;
        } else if (field.type === 'file') {
            if (!isPublicHttpUrl(value)) errors[key] = `${field.label} must be a valid public http or https link`;
        } else {
            const max = field.type === 'textarea' ? LIMITS.answerTextarea : LIMITS.answerText;
            if (value.length > max) errors[key] = `${field.label} cannot exceed ${max} characters`;
        }
    }
    return errors;
}

/** The answers the API gets: one per question that has a value, in the cohort's order */
export function buildAnswers(fields: CustomField[], values: Record<string, string>): AnswerValue[] {
    const out: AnswerValue[] = [];
    for (const field of fields) {
        const value = cleanAnswer(values[field._id] ?? '', field.type);
        if (value) out.push({ field: field._id, value });
    }
    return out;
}

/** The body of `POST /:id/apply`. Empty links are left out. */
export function buildApplyPayload(values: ApplicationValues, fields: CustomField[], answers: Record<string, string>): ApplyPayload {
    const payload: ApplyPayload = { coverLetter: values.coverLetter.trim(), answers: buildAnswers(fields, answers) };
    for (const key of ['githubUrl', 'linkedinUrl', 'portfolioUrl', 'resumeUrl'] as const) {
        const v = values[key]?.trim();
        if (v) payload[key] = v;
    }
    return payload;
}

/** zod issues as `{ field: message }`, first message per field */
export function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const issue of issues) {
        const key = issue.path.map(String).join('.');
        if (!out[key]) out[key] = issue.message;
    }
    return out;
}

/** The whole application form: fixed fields first, then the cohort's questions */
export function validateApplication(values: ApplicationValues, fields: CustomField[], answers: Record<string, string>): Record<string, string> {
    const parsed = applicationSchema.safeParse(values);
    return { ...(parsed.success ? {} : issuesToErrors(parsed.error.issues)), ...validateAnswers(fields, answers) };
}
