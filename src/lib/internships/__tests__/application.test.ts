import { describe, it, expect } from 'vitest';
import {
    applicationSchema, buildAnswers, buildApplyPayload, cleanAnswer, emptyApplication, isHttpUrl, isInternalHost, isPublicHttpUrl, parseHttpUrl, validateAnswers, validateApplication,
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

describe('isInternalHost (mirrors the API)', () => {
    it('spots the hosts the API test lists, and the ones it accepts', () => {
        // the vectors of the API's own unit test
        for (const host of ['localhost', '127.0.0.1', '10.0.0.5', '[::1]', '169.254.169.254', 'printer.local', 'intranet', '2130706433', '0x7f000001', 'a.localhost']) {
            expect(isInternalHost(host), host).toBe(true);
        }
        for (const host of ['example.org', 'portswigger.net', 'sub.domain.co.uk']) expect(isInternalHost(host), host).toBe(false);
    });

    it('refuses every IP literal, public ones too, and the internal top-level names', () => {
        for (const host of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '[2001:db8::1]', '2001:db8::1', 'EXAMPLE.LOCAL.', '[::ffff:7f00:1]']) expect(isInternalHost(host), host).toBe(true);
        for (const tld of ['local', 'internal', 'lan', 'home', 'corp', 'intranet', 'test', 'invalid', 'example']) expect(isInternalHost(`host.${tld}`), tld).toBe(true);
        expect(isInternalHost('my.homepage.dev')).toBe(false);
        expect(isInternalHost('corp.example.org')).toBe(false);
        expect(isInternalHost('www.example.org.')).toBe(false);
    });

    it('treats a bare or odd number, a hex number and a one-label name as addresses', () => {
        for (const host of ['2130706433', '0x7f000001', '1.2.3', '300.1.1.1', '999.999.999.999', 'nas', 'db-1']) expect(isInternalHost(host), host).toBe(true);
    });
});

describe('parseHttpUrl', () => {
    it('is the API\'s parse: trimmed, http(s), no credentials, a host', () => {
        expect(parseHttpUrl('  https://example.org/a  ')?.hostname).toBe('example.org');
        for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x', 'ftp://example.org/x', 'file:///etc/passwd', 'https://user:pw@example.org/', '//example.org', 'not a url', '']) {
            expect(parseHttpUrl(bad), bad).toBeNull();
        }
        expect(parseHttpUrl(42 as unknown as string)).toBeNull();
    });
});

describe('isPublicHttpUrl', () => {
    it('refuses localhost, any IP address, internal names and IPv6 literals, and accepts any real public host', () => {
        for (const bad of ['http://localhost:3000/x', 'https://127.0.0.1/a', 'http://10.0.0.5/a', 'https://192.168.1.2/a', 'http://172.20.0.1', 'http://169.254.169.254/latest', 'https://printer.local/cv', 'https://svc.internal/x', 'http://[::1]/x', 'https://intranet/cv', 'https://u:p@example.org/a', 'https://8.8.8.8/cv', 'https://172.32.0.1/ok', 'http://2130706433/', 'http://0x7f000001/', 'https://nas.home/cv', 'https://wiki.corp/cv', 'https://hr.intranet/cv', 'https://x.test/cv', 'https://x.invalid/cv', 'https://x.example/cv', 'https://x.localhost/cv']) {
            expect(isPublicHttpUrl(bad), bad).toBe(false);
        }
        for (const good of ['https://github.com/ada', 'https://drive.google.com/file/d/1/view', 'http://example.io/cv.pdf', 'https://my.portfolio.dev/', 'https://example.org./cv', '  https://github.com/ada  ']) {
            expect(isPublicHttpUrl(good), good).toBe(true);
        }
    });
    it('caps the length at 2048 without guessing at top-level domains', () => {
        expect(isPublicHttpUrl(`https://example.org/${'a'.repeat(2040)}`)).toBe(false);
        expect(isPublicHttpUrl(`https://example.org/${'a'.repeat(2000)}`)).toBe(true);
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
