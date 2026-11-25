import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { startMockApi } from './mock-api-server';

/**
 * For `npm run test:e2e:ssr` (see `ssr.playwright.config.ts`): starts the stand-in API, builds the app
 * against it (the list pages are rendered during the build, so the API has to be up by then), starts the
 * production server, and stops both when the run ends. `E2E_SKIP_BUILD=1` reuses a build made this way.
 */
export default async function globalSetup() {
    const apiPort = Number(process.env.E2E_MOCK_API_PORT);
    const appPort = process.env.E2E_APP_PORT || '3100';
    const api = await startMockApi(apiPort);
    const env = { ...process.env, NEXT_PUBLIC_API_URL: api.url };
    // Run through node itself, so that stopping the server stops it and not a wrapper around it
    const nextBin = createRequire(__filename).resolve('next/dist/bin/next');

    if (!process.env.E2E_SKIP_BUILD) {
        // Not spawnSync: this process is the stand-in API, and it has to answer the build while it runs
        const status = await new Promise<number | null>((resolve) => {
            spawn(process.execPath, [nextBin, 'build'], { stdio: 'inherit', env }).on('exit', resolve);
        });
        if (status !== 0) { await api.close(); throw new Error('The build failed'); }
    }
    const app = spawn(process.execPath, [nextBin, 'start', '-p', appPort], { stdio: 'inherit', env });
    const stop = async () => { app.kill(); await api.close(); };

    for (let i = 0; i < 60; i += 1) {
        try { if ((await fetch(`http://localhost:${appPort}`)).ok) return stop; } catch { /* not up yet */ }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await stop();
    throw new Error('The app did not start');
}
