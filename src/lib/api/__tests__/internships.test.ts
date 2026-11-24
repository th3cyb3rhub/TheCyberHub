import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchApi = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ fetchApi, API_URL: 'https://api.example.test' }));

import * as api from '../internships';

beforeEach(() => {
    fetchApi.mockReset();
    fetchApi.mockResolvedValue({ success: true, data: { ok: 1 } });
});

describe('paths and queries', () => {
    it('lists with the filters that are set, and only those', async () => {
        await api.listCohorts({});
        expect(fetchApi).toHaveBeenLastCalledWith('/api/internships');
        await api.listCohorts({ type: 'mentorship', status: 'closed', page: 2, limit: 12 });
        expect(Object.fromEntries(new URLSearchParams(String(fetchApi.mock.lastCall?.[0]).split('?')[1]))).toEqual({ type: 'mentorship', status: 'closed', page: '2', limit: '12' });
        await api.listCohorts({ page: 1, type: '' });
        expect(fetchApi).toHaveBeenLastCalledWith('/api/internships');
    });

    it('asks for everything with all=true for staff, and never on the public path', async () => {
        await api.listAdminCohorts({ status: 'draft', page: 3, limit: 20 });
        const qs = new URLSearchParams(String(fetchApi.mock.lastCall?.[0]).split('?')[1]);
        expect(qs.get('all')).toBe('true');
        expect(qs.get('status')).toBe('draft');
        await api.listCohorts({});
        expect(String(fetchApi.mock.lastCall?.[0])).not.toContain('all=');
    });

    it('uses /api/internships for every call, never the dead /api/admin paths', async () => {
        await api.listPastCohorts({ page: 2 });
        await api.getCohort('abc');
        await api.listMyApplications({ status: 'pending' });
        await api.listCohortApplications('c1', { status: 'accepted', page: 2 });
        await api.getStaffApplication('a1');
        const urls = fetchApi.mock.calls.map((c) => c[0]);
        expect(urls).toEqual([
            '/api/internships/past?page=2',
            '/api/internships/abc',
            '/api/internships/applications/me?status=pending',
            '/api/internships/c1/applications?status=accepted&page=2',
            '/api/internships/applications/a1',
        ]);
        expect(urls.some((u) => String(u).includes('/api/admin'))).toBe(false);
    });

    it('returns the data of a single', async () => {
        await expect(api.getCohort('abc')).resolves.toEqual({ ok: 1 });
    });
});

describe('writes', () => {
    it('applies with a POST body and the id in the path', async () => {
        const body = { coverLetter: 'a long enough letter', answers: [{ field: 'f', value: 'v' }] };
        await api.applyToCohort('c1', body);
        expect(fetchApi).toHaveBeenCalledWith('/api/internships/c1/apply', { method: 'POST', body: JSON.stringify(body) });
    });

    it('withdraws with an optional trimmed reason', async () => {
        await api.withdrawApplication('a1', '  found another offer ');
        expect(fetchApi).toHaveBeenLastCalledWith('/api/internships/applications/a1/withdraw', { method: 'PUT', body: JSON.stringify({ reason: 'found another offer' }) });
        await api.withdrawApplication('a1', '   ');
        expect(fetchApi).toHaveBeenLastCalledWith('/api/internships/applications/a1/withdraw', { method: 'PUT', body: '{}' });
    });

    it('changes a status with the note only when there is one', async () => {
        await api.changeApplicationStatus('a1', { status: 'accepted', note: ' welcome ' });
        expect(fetchApi).toHaveBeenLastCalledWith('/api/internships/applications/a1/status', { method: 'PUT', body: JSON.stringify({ status: 'accepted', note: 'welcome' }) });
        await api.changeApplicationStatus('a1', { status: 'rejected', note: '' });
        expect(fetchApi).toHaveBeenLastCalledWith('/api/internships/applications/a1/status', { method: 'PUT', body: JSON.stringify({ status: 'rejected' }) });
    });

    it('creates with POST / and edits with PUT /:id', async () => {
        await api.createCohort({ title: 'x' });
        expect(fetchApi).toHaveBeenLastCalledWith('/api/internships', { method: 'POST', body: '{"title":"x"}' });
        await api.updateCohort('c1', { status: 'closed' });
        expect(fetchApi).toHaveBeenLastCalledWith('/api/internships/c1', { method: 'PUT', body: '{"status":"closed"}' });
    });
});
