/**
 * The forms of the mentorship screens as zod schemas. Every limit mirrors the API validators
 * (src/validations/mentorship.validation.js), so a form that passes here passes there.
 */
import { z } from 'zod';
import { EXPERTISE_AREAS, SKILL_LEVELS } from './display';
import { isValidTimeZone, sessionInstant, sessionWindow } from './time';

export const LIMITS = {
    bio: { min: 50, max: 1000 },
    goals: { min: 100, max: 500 },
    mentorAreas: 5,
    requestAreas: 3,
    hoursPerWeek: { min: 1, max: 20 },
    maxMentees: { min: 1, max: 5 },
    slots: 21,
    sessionTitle: { min: 3, max: 200 },
    sessionDuration: { min: 15, max: 120 },
    sessionDescription: 1000,
    meetingUrl: 300,
    comment: 500,
    reason: { min: 3, max: 500 },
    reportDetails: 500,
    declineReason: 300,
    message: 5000,
    fileBytes: 5 * 1024 * 1024,
    notes: 5000,
} as const;

/** The types the chat accepts (the same list as the API) */
export const CHAT_FILE_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain',
] as const;

export const CHAT_FILE_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.txt';

const areas = (max: number) => z.array(z.enum(EXPERTISE_AREAS as unknown as [string, ...string[]]))
    .min(1, 'Choose at least one area')
    .max(max, `Choose at most ${max} areas`);

export const slotSchema = z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
}).refine((s) => s.endHour > s.startHour, 'A time slot must end after it starts');

export const mentorApplicationSchema = z.object({
    expertiseAreas: areas(LIMITS.mentorAreas),
    bio: z.string().trim()
        .min(LIMITS.bio.min, `Write at least ${LIMITS.bio.min} characters about yourself`)
        .max(LIMITS.bio.max, `Keep it under ${LIMITS.bio.max} characters`),
    hoursPerWeek: z.number({ error: 'Enter the hours you can give each week' }).int('Use a whole number of hours')
        .min(LIMITS.hoursPerWeek.min, 'At least 1 hour a week')
        .max(LIMITS.hoursPerWeek.max, 'At most 20 hours a week'),
    timezone: z.string().refine(isValidTimeZone, 'Pick a valid time zone'),
    preferredTimes: z.array(slotSchema).max(LIMITS.slots, `At most ${LIMITS.slots} time slots`),
    maxMentees: z.number({ error: 'Choose how many mentees you can take' }).int()
        .min(LIMITS.maxMentees.min, 'At least 1 mentee')
        .max(LIMITS.maxMentees.max, 'At most 5 mentees'),
    conductAccepted: z.literal(true, { error: 'You must accept the code of conduct' }),
});
export type MentorApplicationValues = z.infer<typeof mentorApplicationSchema>;

export const mentorshipRequestSchema = z.object({
    expertiseAreas: areas(LIMITS.requestAreas),
    goals: z.string().trim()
        .min(LIMITS.goals.min, `Describe your goals in at least ${LIMITS.goals.min} characters`)
        .max(LIMITS.goals.max, `Keep your goals under ${LIMITS.goals.max} characters`),
    skillLevel: z.enum(SKILL_LEVELS as unknown as [string, ...string[]], { error: 'Pick your skill level' }),
    conductAccepted: z.literal(true, { error: 'You must accept the code of conduct' }),
});
export type MentorshipRequestValues = z.infer<typeof mentorshipRequestSchema>;

export const feedbackSchema = z.object({
    rating: z.number({ error: 'Pick a rating from 1 to 5' }).int().min(1, 'Pick a rating from 1 to 5').max(5, 'Pick a rating from 1 to 5'),
    comment: z.string().trim().max(LIMITS.comment, `A comment cannot exceed ${LIMITS.comment} characters`),
    shareName: z.boolean(),
});
export type FeedbackValues = z.infer<typeof feedbackSchema>;

export const reasonSchema = z.string().trim()
    .min(LIMITS.reason.min, `Give a reason of at least ${LIMITS.reason.min} characters`)
    .max(LIMITS.reason.max, `A reason cannot exceed ${LIMITS.reason.max} characters`);

export const REPORT_REASONS = [
    { value: 'spam', label: 'Spam' },
    { value: 'harassment', label: 'Harassment or bullying' },
    { value: 'hate_speech', label: 'Hate speech' },
    { value: 'misinformation', label: 'Misinformation' },
    { value: 'inappropriate', label: 'Inappropriate content' },
    { value: 'copyright', label: 'Copyright violation' },
    { value: 'other', label: 'Other' },
] as const;

export const reportSchema = z.object({
    reason: z.enum(REPORT_REASONS.map((r) => r.value) as [string, ...string[]], { error: 'Choose a reason' }),
    details: z.string().trim().max(LIMITS.reportDetails, `Details cannot exceed ${LIMITS.reportDetails} characters`),
});

/** An https link without credentials, like the API demands */
export function isHttpsLink(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
        return false;
    }
}

export const sessionFormSchema = (now: Date = new Date()) => z.object({
    title: z.string().trim()
        .min(LIMITS.sessionTitle.min, `Give the session a title of at least ${LIMITS.sessionTitle.min} characters`)
        .max(LIMITS.sessionTitle.max, `A title cannot exceed ${LIMITS.sessionTitle.max} characters`),
    date: z.string().min(1, 'Pick a date'),
    time: z.string().min(1, 'Pick a time'),
    timezone: z.string().refine(isValidTimeZone, 'Pick a valid time zone'),
    duration: z.number({ error: 'Choose a length' }).int()
        .min(LIMITS.sessionDuration.min, `At least ${LIMITS.sessionDuration.min} minutes`)
        .max(LIMITS.sessionDuration.max, `At most ${LIMITS.sessionDuration.max} minutes`),
    meetingUrl: z.string().trim().max(LIMITS.meetingUrl, `A link cannot exceed ${LIMITS.meetingUrl} characters`)
        .refine((v) => v === '' || isHttpsLink(v), 'The meeting link must be a valid https link'),
    description: z.string().trim().max(LIMITS.sessionDescription, `A description cannot exceed ${LIMITS.sessionDescription} characters`),
}).superRefine((value, ctx) => {
    if (!value.date || !value.time || !isValidTimeZone(value.timezone)) return;
    const instant = sessionInstant(value.date, value.time, value.timezone);
    const window = sessionWindow(instant, now);
    if (window === 'invalid') ctx.addIssue({ code: 'custom', path: ['time'], message: 'That time does not exist in this time zone (the clocks change then). Pick another time.' });
    else if (window === 'too-soon') ctx.addIssue({ code: 'custom', path: ['time'], message: 'A session must start at least 5 minutes from now.' });
    else if (window === 'too-far') ctx.addIssue({ code: 'custom', path: ['date'], message: 'A session cannot be more than 90 days ahead.' });
});
export type SessionFormValues = z.infer<ReturnType<typeof sessionFormSchema>>;

/** `{ field: first message }` from a failed parse */
export function issuesByField(error: z.ZodError): Record<string, string> {
    const out: Record<string, string> = {};
    for (const issue of error.issues) {
        const key = issue.path.join('.') || '_';
        if (!out[key]) out[key] = issue.message;
    }
    return out;
}

/** Why a file cannot go in the chat, or null when it can */
export function chatFileProblem(file: { type: string; size: number; name: string }): string | null {
    if (!(CHAT_FILE_TYPES as readonly string[]).includes(file.type)) return 'This file type is not allowed. Use an image, PDF, Word or text file.';
    if (file.size > LIMITS.fileBytes) return 'The file is too large. The limit is 5 MB.';
    if (file.size < 1) return 'The file is empty.';
    return null;
}

export function messageProblem(content: string): string | null {
    const trimmed = content.trim();
    if (!trimmed) return 'Write a message first.';
    if (trimmed.length > LIMITS.message) return `A message cannot exceed ${LIMITS.message} characters.`;
    return null;
}
