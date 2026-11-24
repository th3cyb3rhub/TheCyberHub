import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicCohort } from '../server';
import { COHORT_ID, makeCohort } from './fixtures';

const respond = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => { vi.restoreAllMocks(); });

describe('fetchPublicCohort', () => {
    it('returns the cohort and asks the API once, without a token', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(200, { success: true, data: makeCohort() }));
        const result = await fetchPublicCohort(COHORT_ID);
        expect(result).toMatchObject({ state: 'ok', cohort: { title: 'Summer Security Internship' } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toMatch(new RegExp(`/api/internships/${COHORT_ID}$`));
        expect((init as RequestInit).headers).toBeUndefined();
        expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    });

    it('says missing for a 404 and for an id that cannot exist, without asking the API for the latter', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(404, { success: false }));
        expect(await fetchPublicCohort('b'.repeat(24))).toEqual({ state: 'missing' });
        fetchMock.mockClear();
        expect(await fetchPublicCohort('not-an-id')).toEqual({ state: 'missing' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails soft: a server error, a timeout or a bad body is `error`, never an exception', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock.mockResolvedValueOnce(respond(500));
        expect(await fetchPublicCohort('c'.repeat(24))).toEqual({ state: 'error' });
        fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
        expect(await fetchPublicCohort('d'.repeat(24))).toEqual({ state: 'error' });
        fetchMock.mockResolvedValueOnce(respond(200, { data: { nope: true } }));
        expect(await fetchPublicCohort('e'.repeat(24))).toEqual({ state: 'error' });
    });
});
