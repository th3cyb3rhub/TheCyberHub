# Security tools

One folder per tool under `src/app/tools/<slug>/`, listed in one place: `src/lib/tools/registry.ts`.
The registry feeds the tools index, the site-wide search, the home section, the navbar count and the
sitemap. A test (`src/lib/tools/__tests__/registry.test.ts`) fails when the registry and the folders
disagree, so add the folder and the registry entry together.

## Where a tool runs

| Kind | What it means | Examples |
|---|---|---|
| `offline` | Runs in the browser. Nothing you type is sent anywhere. | JWT analyzer, encoder, hash analyzer, payload lists |
| `reference` | Static help and links. | Port reference and Nmap builder, Exploit-DB links |
| `server` | Calls our API (`/api/tools/*`). | CVE, WHOIS, DNS, IP lookups; header, CORS, TLS, subdomain and takeover checks |

`GET /api/tools` is the source of truth for names, categories and whether a tool is switched on.
`FALLBACK_TOOLS` in the registry is what the page shows while that request loads or when it fails.

## Server tools

- Lookups (CVE, WHOIS, DNS, IP) work without an account; a signed-in account gets a higher limit.
- Checks that connect to a target (headers, CORS, TLS, subdomains, takeover) need a signed-in account
  with a verified e-mail address and a tick on "I own this target or have written permission".
  They are off by default in production until an operator turns them on; an admin can pause any tool
  at `/admin/tools`.
- API client: `src/lib/api/tools.ts`. Hooks: `src/hooks/queries/useTools.ts`. Error text:
  `src/lib/tools/errors.ts`. Shared screens: `src/components/tools/`.
- A failed or limited call is shown as a failure with its reason (rate limit with a countdown, blocked
  target with the reason, paused tool, data source down). It is never shown as an empty result.

## What the site does not do

- No port scanning. The port page is a reference and a command builder.
- No out-of-band listener for SSRF. The payload page takes a callback URL you bring.
- No SSL letter grade, no IP geolocation, no exploit search. Those pages give facts or link out.

## Adding a tool

1. Create `src/app/tools/<slug>/page.tsx` (and a `layout.tsx` with its metadata).
2. Add it to `FALLBACK_TOOLS` in `src/lib/tools/registry.ts` with a category, icon name and keywords.
3. For a server tool, add the API call to `src/lib/api/tools.ts`, a hook, and its error handling.
4. Tests: logic in `src/lib/tools/*` with a unit test; the page with a Testing Library or Playwright test.

Content-Security-Policy `connect-src` is built in `src/lib/security/csp.ts`; a tool that needs a new
origin has to say why there.
