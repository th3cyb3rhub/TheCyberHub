import path from 'node:path';
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';

/**
 * The server rendered shell spec with its server-data checks on: `npm run test:e2e:ssr`.
 * Ports: E2E_MOCK_API_PORT (default 5891, the stand-in API) and E2E_APP_PORT (default 3100, the app).
 * It builds, so it replaces `.next`: stop a dev server on the same checkout first.
 */
process.env.E2E_MOCK_API_PORT ||= '5891';
const appPort = process.env.E2E_APP_PORT || '3100';

export default defineConfig({
    ...base,
    testDir: path.join(__dirname, '..'),
    testMatch: 'ssr-shell.spec.ts',
    globalSetup: path.join(__dirname, 'ssr-global-setup.ts'),
    webServer: undefined,
    use: { ...base.use, baseURL: `http://localhost:${appPort}` },
    // Next to the other config, not next to this file (the repository ignores these two folders at its root)
    outputDir: path.join(__dirname, '../../test-results'),
    reporter: [['list'], ['html', { outputFolder: path.join(__dirname, '../../playwright-report'), open: 'never' }]],
});
