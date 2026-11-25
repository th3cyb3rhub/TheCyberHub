import { describe, it, expect } from 'vitest';
import { safeRedirectPath, signInHref } from '../safeRedirect';

describe('safeRedirectPath', () => {
    it.each(['/profile', '/mentorship/abc?tab=1', '/admin/events#top'])('keeps %s', (path) => {
        expect(safeRedirectPath(path)).toBe(path);
    });

    it.each([
        'https://evil.example',
        'http://evil.example/x',
        '//evil.example',
        '/\\evil.example',
        '\\\\evil.example',
        'javascript:alert(1)',
        'profile',
        '/path\nwith-newline',
        '/\t/evil.example',
        '/%2F/evil.example',
        '/%2f%2fevil.example',
        '/%5Cevil.example',
        '/%255Cevil.example',
        '/%252F%252Fevil.example',
        '/%0d%0a/evil.example',
        '/%E0%A4%A',
        '/auth',
        '/auth?redirect=%2Fprofile',
        '/auth/callback/github?code=1',
        '/AUTH#x',
        `/${'a'.repeat(3000)}`,
        '',
        null,
        undefined,
    ])('falls back for %j', (value) => {
        expect(safeRedirectPath(value as string | null | undefined)).toBe('/profile');
    });

    it('keeps paths that only start like the sign-in page', () => {
        expect(safeRedirectPath('/authors/ada')).toBe('/authors/ada');
        expect(safeRedirectPath('/blog?next=%2Fauth')).toBe('/blog?next=%2Fauth');
    });

    it('keeps an encoded path that stays on this site', () => {
        expect(safeRedirectPath('/search?q=a%20b')).toBe('/search?q=a%20b');
    });

    it('uses the given fallback', () => {
        expect(safeRedirectPath('//evil.example', '/')).toBe('/');
    });
});

describe('signInHref', () => {
    it('brings the person back to a safe path', () => {
        expect(signInHref('/notifications?tab=all')).toBe('/auth?redirect=%2Fnotifications%3Ftab%3Dall');
    });

    it.each(['//evil.example', '/\\evil.example', 'https://evil.example', '/auth', null, undefined])('drops %j', (value) => {
        expect(signInHref(value as string | null | undefined)).toBe('/auth');
    });
});
