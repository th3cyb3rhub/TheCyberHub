import { describe, it, expect } from 'vitest';
import {
    applicationSchema, buildAnswers, buildApplyPayload, cleanAnswer, emptyApplication, isHttpUrl, isPublicHttpUrl, validateAnswers, validateApplication,
} from '../application';
import { questions, QUESTION_AREA, QUESTION_FILE, QUESTION_PICK, QUESTION_TEXT } from './fixtures';

describe('isHttpUrl', () => {
    it('accepts http and https only, without credentials', () => {
        expect(isHttpUrl('https://github.com/ada')).toBe(true);
        expect(isHttpUrl('http://example.org')).toBe(true);
        expect(isHttpUrl('javascript:alert(1)')).toBe(false);
        expect(isHttpUrl('data:text/html,hi')).toBe(false);
        expect(isHttpUrl('ftp://example.org/file')).toBe(false);
        expect(isHttpUrl('https://user:pass@example.org')).toBe(false);
        expect(isHttpUrl('not a link')).toBe(false);
    });
});

describe('isPublicHttpUrl', () => {
    it('refuses localhost, private ranges, internal names and IPv6 literals, and accepts any real public host', () => {
        for (const bad of ['http://localhost:3000/x', 'https://127.0.0.1/a', 'http://10.0.0.5/a', 'https://192.168.1.2/a', 'http://172.20.0.1', 'http://169.254.169.254/latest', 'https://printer.local/cv', 'https://svc.internal/x', 'http://[::1]/x', 'https://intranet/cv', 'https://u:p@example.org/a']) {
            expect(isPublicHttpUrl(bad), bad).toBe(false);
        }
        for (const good of ['https://github.com/ada', 'https://drive.google.com/file/d/1/view', 'http://example.io/cv.pdf', 'https://my.portfolio.dev/', 'https://172.32.0.1/ok']) {
            expect(isPublicHttpUrl(good), good).toBe(true);
        }
    });
    it('caps the length at 2048 without guessing at top-level domains', () => {
        expect(isPublicHttpUrl(`https://example.org/${'a'.repeat(2040)}`)).toBe(false);
        expect(isPublicHttpUrl('https://example.technology/x')).toBe(true);
    });
});

describe('application form', () => {
    it('needs a cover letter of 10 to 3000 characters', () => {
        const base = emptyApplication();
        expect(applicationSchema.safeParse({ ...base, coverLetter: 'short' }).success).toBe(false);
        expect(applicationSchema.safeParse({ ...base, coverLetter: '   short   ' }).success).toBe(false);
        expect(applicationSchema.safeParse({ ...base, coverLetter: 'x'.repeat(10) }).success).toBe(true);
        expect(applicationSchema.safeParse({ ...base, coverLetter: 'x'.repeat(3000) }).success).toBe(true);
        expect(applicationSchema.safeParse({ ...base, coverLetter: 'x'.repeat(3001) }).success).toBe(false);
    });

    it('allows empty links and refuses anything that is not http or https', () => {
        const ok = { ...emptyApplication(), coverLetter: 'a long enough letter' };
        expect(applicationSchema.safeParse(ok).success).toBe(true);
        const bad = validateApplication({ ...ok, githubUrl: 'javascript:alert(1)', resumeUrl: 'ftp://x.org/cv' }, [], {});
        expect(bad.githubUrl).toMatch(/http/);
        expect(bad.resumeUrl).toMatch(/http/);
        expect(bad.linkedinUrl).toBeUndefined();
    });

    it('keys problems like the API does', () => {
        const errors = validateApplication({ ...emptyApplication(), coverLetter: 'hi' }, questions(), {});
        expect(Object.keys(errors).sort()).toEqual(['answers.' + QUESTION_PICK, 'answers.' + QUESTION_TEXT, 'coverLetter'].sort());
    });
});

describe('answers to custom questions', () => {
    const fields = questions();

    it('requires the required ones and ignores blanks of optional ones', () => {
        const errors = validateAnswers(fields, { [QUESTION_TEXT]: '   ', [QUESTION_AREA]: '' });
        expect(errors[`answers.${QUESTION_TEXT}`]).toBe('Your favourite tool is required');
        expect(errors[`answers.${QUESTION_PICK}`]).toBe('Preferred track is required');
        expect(errors[`answers.${QUESTION_AREA}`]).toBeUndefined();
    });

    it('applies the limit of each type: 500 for text, 3000 for long text', () => {
        const long = 'x'.repeat(501);
        expect(validateAnswers(fields, { [QUESTION_TEXT]: long, [QUESTION_PICK]: 'Offensive' })[`answers.${QUESTION_TEXT}`]).toMatch(/cannot exceed 500/);
        const area = validateAnswers(fields, { [QUESTION_TEXT]: 'a', [QUESTION_PICK]: 'Offensive', [QUESTION_AREA]: 'y'.repeat(3000) });
        expect(area[`answers.${QUESTION_AREA}`]).toBeUndefined();
        const tooLong = validateAnswers(fields, { [QUESTION_TEXT]: 'a', [QUESTION_PICK]: 'Offensive', [QUESTION_AREA]: 'y'.repeat(3001) });
        expect(tooLong[`answers.${QUESTION_AREA}`]).toMatch(/cannot exceed 3000/);
    });

    it('takes a dropdown value only from its options, and a file only as an http(s) link', () => {
        const wrongOption = validateAnswers(fields, { [QUESTION_TEXT]: 'a', [QUESTION_PICK]: 'Purple' });
        expect(wrongOption[`answers.${QUESTION_PICK}`]).toMatch(/one of the options/);
        const badFile = validateAnswers(fields, { [QUESTION_TEXT]: 'a', [QUESTION_PICK]: 'Defensive', [QUESTION_FILE]: 'javascript:alert(1)' });
        expect(badFile[`answers.${QUESTION_FILE}`]).toMatch(/public http or https link/);
        expect(validateAnswers(fields, { [QUESTION_TEXT]: 'a', [QUESTION_PICK]: 'Defensive', [QUESTION_FILE]: 'https://example.org/report.pdf' })).toEqual({});
    });

    it('cleans a text answer to one line and trims a long one', () => {
        expect(cleanAnswer('  one\n two\t three  ', 'text')).toBe('one two three');
        expect(cleanAnswer('  line one\r\nline two  ', 'textarea')).toBe('line one\nline two');
        expect(cleanAnswer('a\u0000b', 'text')).toBe('ab');
    });

    it('maps the answers to the payload: by question id, blanks left out, in the cohort order', () => {
        expect(buildAnswers(fields, { [QUESTION_PICK]: 'Offensive', [QUESTION_TEXT]: ' Burp  Suite ', [QUESTION_AREA]: '   ' })).toEqual([
            { field: QUESTION_TEXT, value: 'Burp Suite' },
            { field: QUESTION_PICK, value: 'Offensive' },
        ]);
    });

    it('builds the whole body without empty links', () => {
        const payload = buildApplyPayload(
            { ...emptyApplication(), coverLetter: '  I would love to join.  ', githubUrl: ' https://github.com/ada ', portfolioUrl: '' },
            fields,
            { [QUESTION_TEXT]: 'Burp', [QUESTION_PICK]: 'Defensive' },
        );
        expect(payload).toEqual({
            coverLetter: 'I would love to join.',
            githubUrl: 'https://github.com/ada',
            answers: [{ field: QUESTION_TEXT, value: 'Burp' }, { field: QUESTION_PICK, value: 'Defensive' }],
        });
    });
});
