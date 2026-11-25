#!/usr/bin/env node
// Runs the server rendered shell spec (e2e/ssr-shell.spec.ts) with its server-data checks on.
//
// Those checks read what the app's own server fetched while rendering, so the app has to be built
// with NEXT_PUBLIC_API_URL pointing at the stand-in API (e2e/support/mock-api-server.ts), which
// Playwright starts for the run. This script: builds that way, starts the production server,
// runs the spec, and stops the server. It replaces `.next`, so a dev server on the same checkout
// should be stopped first.
//
//   npm run test:e2e:ssr                     # build, start, run
//   E2E_SKIP_BUILD=1 npm run test:e2e:ssr    # reuse the existing build (it must have been made this way)
//
// Ports: E2E_MOCK_API_PORT (default 5891) and E2E_APP_PORT (default 3100).
import { spawn, spawnSync } from 'node:child_process';

const mockPort = process.env.E2E_MOCK_API_PORT || '5891';
const appPort = process.env.E2E_APP_PORT || '3100';
const env = { ...process.env, NEXT_PUBLIC_API_URL: `http://127.0.0.1:${mockPort}`, E2E_MOCK_API_PORT: mockPort, BASE_URL: `http://localhost:${appPort}` };
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' }).status ?? 1;

if (!process.env.E2E_SKIP_BUILD) {
    const built = run('npx', ['next', 'build']);
    if (built !== 0) process.exit(built);
}

const app = spawn('npx', ['next', 'start', '-p', appPort], { stdio: 'inherit', env, shell: process.platform === 'win32' });
const stop = () => { if (!app.killed) app.kill(); };
process.on('exit', stop);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); process.exit(130); });

async function ready() {
    for (let i = 0; i < 60; i += 1) {
        try { if ((await fetch(env.BASE_URL)).ok) return true; } catch { /* not up yet */ }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
}

if (!(await ready())) {
    console.error('The app did not start');
    stop();
    process.exit(1);
}
const code = run('npx', ['playwright', 'test', 'e2e/ssr-shell.spec.ts', '--project=chromium']);
stop();
process.exit(code);
