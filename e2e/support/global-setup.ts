import { startMockApi } from './mock-api-server';

/**
 * Starts the stand-in API (see `mock-api-server.ts`) when `E2E_MOCK_API_PORT` is set. Build and start
 * the app with `NEXT_PUBLIC_API_URL=http://localhost:<that port>` so its server fetches reach it.
 */
export default async function globalSetup() {
    const port = Number(process.env.E2E_MOCK_API_PORT);
    if (!Number.isInteger(port) || port <= 0) return undefined;
    const api = await startMockApi(port);
    return async () => { await api.close(); };
}
