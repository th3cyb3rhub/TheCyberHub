# TheCyberHub Architecture

This document describes the system architecture of TheCyberHub, a cybersecurity education and community platform.

## High-Level Overview

```
                         +------------------+
                         |   Cloudflare /   |
                         |   Nginx Proxy    |
                         +--------+---------+
                                  |
                    +-------------+-------------+
                    |                           |
           +-------v--------+         +--------v--------+
           |  Next.js 15    |         |  Express.js 4   |
           |  Frontend      |         |  API Server     |
           |  (Port 3000)   |         |  (Port 5001)    |
           +-------+--------+         +---+----+----+---+
                   |                      |    |    |
                   |               +------+    |    +------+
                   |               |           |           |
              +----v----+    +-----v---+  +----v----+  +---v------+
              | Browser |    | MongoDB |  |  Redis  |  | AWS S3   |
              | Client  |    |   7     |  |   7     |  | (Uploads)|
              +---------+    +---------+  +---------+  +----------+
                   |
              +----v---------+
              | Socket.IO    |
              | (Real-time)  |
              +--------------+
```

## Frontend Architecture

### Framework

- **Next.js 15** with App Router (file-based routing under `src/app/`)
- **React 19** with Server and Client Components
- **TypeScript 5.8** for type safety
- **Turbopack** for development bundling

### Routing

All routes live under `src/app/`. Each route directory contains:

- `page.tsx` -- the page component (server or client)
- `layout.tsx` -- optional layout wrapper
- `loading.tsx` -- loading UI (Suspense boundary)
- `error.tsx` -- error boundary
- `not-found.tsx` -- what `notFound()` shows. A server component (the notice is the one the server renders); a detail page that a staff member may still open has a small client island inside it that asks the API again, only when the browser holds a sign-in token

A `loading.tsx` wraps its page, and every page below it, in a Suspense boundary, so the response starts as HTTP 200 and `notFound()` or `permanentRedirect()` can no longer change the status. Pages that answer with a real 404 or 308 therefore have no `loading.tsx` at their segment or any segment above it, including `src/app/`; `src/app/__tests__/httpStatus.test.ts` keeps it that way. Those are: the job (404, and 308 from an old slug), lab, exercise, competition and its results, program, company, event series and certificate pages (404), and the roadmap and learning path pages (308 when a path is opened under the other kind's address, through `PathPage`; an unknown path still answers 200 with `noindex` and the view's own not-found notice, since the view also loads the path in the browser for staff). The event page also answers from server data, with its description sanitised on the server first.

The root layout renders real HTML on the server (there is no "mounted" gate). The theme is set on `<html>` before the first paint by a small inline script (`themeInitScript` in `src/lib/theme.ts`), which the policy allows like the framework's own inline bootstrap. Anything that only exists in a browser (`window`, `localStorage`, DOMPurify) must not change the first render: use `useSyncExternalStore` or an effect, or `useSanitizer` for HTML.

**What the body of a 404 contains.** The status is the real one (404, with `noindex`), but the HTML of a `notFound()` thrown by a dynamic page is not the page with the layout. In Next 15.5 a thrown `notFound()` that reaches the shell makes the server answer with its error payload (`getErrorRSCPayload` in `next/dist/server/app-render/app-render.js`), which is `<html id="__next_error__"><head>...</head><body></body></html>`: React's server renderer has no error boundaries, so the segment's `not-found.tsx` and the root layout are not used for the HTML. They are in the stream that follows, and the browser draws the notice, inside the layout with the navbar and the theme, as soon as the page hydrates. A server `not-found.tsx` therefore cannot put the navbar or the theme class into the HTML of the 404 (checked against `/labs/<unknown>` and `/jobs/<unknown>`); the only way to get that body is a page that answers 200 or a `loading.tsx` boundary, and both would hide the status that search engines need. What a crawler or a script gets is the status, `noindex` and the title; a visitor sees the full notice a moment later. The addresses the router cannot match at all (`/no-such-page`) are rendered in full by `src/app/not-found.tsx`.

**Who asks the API again.** A job, lab, exercise, competition, results page or program that is not public can still be read by its poster, a reviewer or staff. Their `not-found.tsx` renders the server's notice, and an island (`JobNotFound`, `LabRecovery`, `ExerciseRecovery`, `CompetitionRecovery`, `ResultsRecovery`, `CohortRecovery`) swaps in the real page only when `useHasStoredToken()` is true and the address is well formed. A visitor with no token never makes the extra request.

**How long an unpublished page keeps answering 200.** A detail page answers from the public copy its server fetch cached (`PUBLIC_ITEM_REVALIDATE_SECONDS`, 60 s, in `src/lib/server/cacheTimes.ts`), so an item that was unpublished keeps answering 200 for up to about a minute, plus the refresh the next visit triggers. This holds for events, programs, roadmaps and learning paths, resources, companies, mentors, jobs, labs, competitions and exercises, and `src/lib/server/__tests__/cacheTimes.test.ts` keeps it that way. Labs, jobs, competitions and code review also have an admin-only purge route (`/api/revalidate/*`, built on `purgeTagForStaff`) that the admin screens call after a save, which drops the copy at once. The other areas do not have one: their admin screens write through many separate calls, and a minute is short enough without a purge route to wire into all of them. Lists keep their longer windows (labs and code review lists are rebuilt every five minutes).

**Feedback while a page loads.** With no route level `loading.tsx`, a click on a link to a slow page would show nothing until the page arrives. `NavigationProgress` (mounted in `ClientProviders`) draws a thin bar fixed at the top of the screen: a click on a link to another address of the app starts it (after 120 ms, so cached pages never flash it), and the new pathname or query ends it. It listens to clicks on the document because Next 15 has no router events, and `useLinkStatus` only reports inside the subtree of one `Link`, so it cannot be global; code that calls `router.push` without a link can call `announceNavigationStart()` from `src/lib/navigationProgress.ts`. The bar lets go by itself after 10 s, is `aria-hidden`, takes no space and does not move with a reduced motion setting. The top level navigation links and the bottom bar use `prefetch`; the cards of the jobs, labs, code review and competition lists use `IntentLink`, which prefetches the page when the pointer rests on it, it gets focus or it is touched, so a list does not make the server render every detail page it shows.

Key routes: `/auth`, `/blog`, `/forums`, `/feed`, `/ctf`, `/challenges`, `/events`, `/jobs`, `/mentorship`, `/labs`, `/code-review`, `/tools`, `/cheatsheets`, `/admin`.

### Data Flow

```
User Action
    |
    v
React Component (Client)
    |
    v
fetchApi() from @/lib/api.ts
    |
    +-- Attaches JWT from tokenStore
    +-- Handles 401 with automatic token refresh
    |
    v
Express API (/api/*)
    |
    v
React Component receives JSON response
    |
    v
TanStack React Query caches client-side
```

- **fetchApi()** (`src/lib/api.ts`) is the centralized API client. It auto-attaches the Bearer token from `tokenStore` and performs a single token refresh attempt on 401 responses.
- **TanStack React Query** handles client-side caching, deduplication, and background refetching.
- **tokenStore** (`src/lib/api.ts`) provides `get()`, `set()`, `remove()` methods for JWT access. Direct `localStorage` access is avoided everywhere else.

### Styling

- **Tailwind CSS** with CSS custom properties for theming
- Semantic design tokens in `globals.css` (e.g., `surface.primary`, `content.primary`)
- Dark mode is the default; `dark:` variants support light mode
- **Radix UI** primitives + **shadcn/ui** components in `src/components/ui/`
- **Lucide React** for icons (tree-shaken via `optimizePackageImports`)

### State Management

- **React Context** providers for global state:
  - `AuthContext` -- the signed-in user (a React Query `useMe` query), sign-in, sign-out (see "Auth client flow")
  - `ThemeContext` -- dark/light mode
  - `NotificationProvider` -- Socket.IO real-time notifications
  - `ToastContext` -- ephemeral toast messages
- **TanStack React Query** for server state (API data caching)

### Error Tracking

- **Sentry** with separate configs for client (`sentry.client.config.ts`), server (`sentry.server.config.ts`), and edge (`sentry.edge.config.ts`)
- Custom `global-error.tsx` and per-route `error.tsx` boundaries

### Testing

- **Vitest** + **Testing Library** for unit tests (`src/**/__tests__/*.test.{ts,tsx}`)
- **Playwright** for E2E tests (`e2e/*.spec.ts`) targeting Chromium, Firefox, and Mobile Chrome
- `e2e/ssr-shell.spec.ts` checks the HTML the server sends (status codes, redirects, first paint with scripts off). Its server-data checks read what the app's own server fetched, which a browser route cannot intercept, so they run against a stand-in API (`e2e/support/mock-api-server.ts`, bound to 127.0.0.1) and a build made with `NEXT_PUBLIC_API_URL` pointing at it. `npm run test:e2e:ssr` does all of that (`e2e/support/ssr.playwright.config.ts`: start the stand-in API, build, start, run, stop); the manual workflow `.github/workflows/ci-full.yml` has the same run as a separate job (`e2e-ssr`), off unless chosen

---

## Backend Architecture

### Framework

- **Express.js 4** with MVC pattern
- CommonJS modules (Node.js)
- Entry point: `src/server.js`

### Request Pipeline

```
Incoming Request
    |
    v
Trust Proxy (production)
    |
    v
HTTPS Redirect (production)
    |
    v
Sentry Request Handler
    |
    v
Request ID Middleware (X-Request-Id)
    |
    v
CORS (origin whitelist)
    |
    v
Security Headers (Helmet: CSP, HSTS, X-Frame-Options)
    |
    v
Global Rate Limiter (/api/* -- 50 req/15min anonymous, 200 authenticated)
    |
    v
Body Parser (1MB limit) + Cookie Parser
    |
    v
Input Sanitization (XSS prevention via DOMPurify)
    |
    v
NoSQL Injection Prevention (express-mongo-sanitize)
    |
    v
HTTP Parameter Pollution Prevention (hpp)
    |
    v
Route Handler
    |   Route-level middleware chain: auth -> validate -> rateLimiter -> controller
    v
Sentry Error Handler
    |
    v
404 Handler (notFound)
    |
    v
Global Error Handler (errorHandler)
```

### Directory Structure

```
thecyberhub-core/src/
  controllers/     -- Request handling (one per feature)
  services/        -- Business logic, reusable operations
  models/          -- Mongoose schemas (40 models)
  routes/          -- Route definitions with middleware chains
  middleware/      -- auth, validate, rateLimiter, cache, error, sanitize, security
  validations/     -- Joi schemas (also embedded in validate.js)
  config/          -- db, cache (Redis), swagger, sentry
  utils/           -- asyncHandler, ApiError, logger (Winston), errorCodes
  modules/         -- Feature modules (cache service)
  jobs/            -- Background job scheduler
  socket.js        -- Socket.IO initialization
  server.js        -- Application entry point
```

### Database Layer

- **MongoDB 7** via **Mongoose 8**
- 40 models covering Users, Blogs, Discussions, Challenges, Events, Jobs, Mentorships, Labs, and more
- Compound indexes on frequently queried fields
- Text indexes for full-text search
- Read queries use `.lean()` for performance
- Multi-document mutations use `mongoose.startSession()` transactions
- Atomic operations (`$addToSet`, `$pull`, `$inc` with `findOneAndUpdate`) preferred over read-modify-write

### Caching Layer

- **Redis 7** via **ioredis**
- `cache.service.js` provides `get`, `set`, `del`, `invalidatePattern`
- Cache middleware (`middleware/cache.js`) wraps GET endpoints with configurable TTL
- Rate limiter uses Redis store in production (falls back to memory in development)
- Socket.IO uses Redis adapter for multi-instance pub/sub
- Cache invalidation: always call `cacheService.invalidatePattern()` after mutations

---

## Authentication Flow

### JWT + Refresh Token

```
1. Login (POST /api/auth/login)
   Client sends email + password
       |
       v
   Server validates credentials (bcrypt, 12 rounds)
       |
       +-- If 2FA enabled: returns tempToken, client must POST /api/auth/2fa/verify
       |
       +-- If no 2FA: returns accessToken (short-lived) + sets httpOnly refresh cookie
       |
       v
2. Authenticated Requests
   Client sends: Authorization: Bearer <accessToken>
       |
       v
   protect middleware (middleware/auth.js):
     - Extracts token from Authorization header
     - Verifies with JWT_SECRET
     - Loads user from DB
     - Checks user.isActive
     - Sets req.user
       |
       v
3. Token Refresh (POST /api/auth/refresh)
   Client sends refresh token (httpOnly cookie or body)
       |
       v
   Server validates refresh token (JWT_REFRESH_SECRET)
     - Checks RefreshToken model for revocation
     - Issues new access + refresh token pair
     - Rotates refresh token (old one invalidated)
       |
       v
4. Client-side renewal
   fetchApi() sees 401 AUTH_TOKEN_INVALID -> one shared refresh -> retries the request once
   (details in "Auth client flow" below)
```

### Google OAuth

```
Client obtains Google ID token
    |
    v
POST /api/auth/oauth/google { idToken }   (GitHub: POST /api/auth/oauth/github { code })
    |
    v
Server verifies with Google's tokeninfo endpoint
    |
    v
Creates or links User account -> issues JWT pair
```

### Two-Factor Authentication (2FA)

- TOTP-based (time-based one-time password)
- Separate `JWT_2FA_SECRET` for temporary tokens during 2FA verification
- Enable: `GET /api/auth/2fa/generate` (returns the QR code secret), then `POST /api/auth/2fa/enable`; disable with `POST /api/auth/2fa/disable`
- Verify on login: `POST /api/auth/2fa/verify` with `{ tempToken, code }` (validates the 6-digit code). A wrong code (and an account lockout, identically) is `400 AUTH_2FA_CODE_INVALID`; an expired, malformed or wrong-type `tempToken` is `401 AUTH_2FA_CHALLENGE_EXPIRED`. This route never answers `AUTH_TOKEN_INVALID`
- Rate limited: 5 attempts per 15 minutes

### Auth client flow

What the browser does with the API's auth contract. The pieces: `src/lib/tokenStore.ts` (the access token), `src/lib/api.ts` (`fetchApi`), `src/lib/authRefresh.ts` (the single-flight refresh), `src/lib/authSession.ts` (session-ended events), `src/lib/authErrors.ts` (error codes), `src/context/AuthContext.tsx` and `src/hooks/queries/useMe.ts`. Endpoint paths live in one place, `API_ENDPOINTS.AUTH` in `src/lib/constants/api-endpoints.ts`.

**Tokens.** Every sign-in answers `{ token, refreshToken, expiresIn, data? }` and sets an httpOnly refresh cookie (path `/api/auth`, 7 days). The browser keeps only the access token (`localStorage`, through `tokenStore`, which also tells React when it changes, here or in another tab). The refresh token is the cookie: calls under `/api/auth/` are sent with `credentials: 'include'`. A refresh token an older version of the site kept in `localStorage` is replaced by the cookie flow when the app starts (one renewal, sent once in the body, then dropped). If the browser refuses to store the token (blocked site data, quota), it is kept in memory for the page, so signing in still works; it is then lost on reload and not shared with other tabs.

The refresh cookie is `SameSite=Strict` in production. That only works while the site and the API share a registrable domain: on a preview deployment on another domain the browser never sends the cookie, and the session ends at the first renewal, after the access token's 15 minutes.

**Which 401 means what.** Only a 401 with code `AUTH_TOKEN_INVALID` on a call that carried the access token starts a renewal. Everything else is an error to show:

| Answer | Client does |
|---|---|
| 401 `AUTH_TOKEN_INVALID` on a bearer call | refresh once (shared), send the request again once |
| 401 on `/auth/login`, `/auth/2fa/verify`, other calls without the token | show the message; never refresh, never sign out |
| 401 without a code | show the error |
| 401 `AUTH_SESSION_REVOKED` or `AUTH_LEGACY_TOKEN_REFUSED`, 403 `AUTH_ACCOUNT_DISABLED` | clear the sign-in and leave a note for the sign-in page. A disabled account goes to `/auth?redirect=<current page>` at once; otherwise pages that need a member send them there themselves (public pages just carry on signed out). Only the session the call was sent with is ended: a newer sign-in is left alone |
| 401 `AUTH_2FA_CHALLENGE_EXPIRED` on `/auth/2fa/verify` | back to the password step with a message (a wrong code stays on the code step) |
| 400 `AUTH_PASSWORD_INCORRECT`, 400 `AUTH_2FA_CODE_INVALID` (also a wrong code on `/auth/2fa/verify`, which stays on the code step) | form errors; never a renewal or a sign-out |
| 429 `RATE_LIMIT_EXCEEDED` | show the message with the wait (`Retry-After`, `error.meta.retryAfter`) |

**Single flight.** While a refresh runs, every request that fails with `AUTH_TOKEN_INVALID` waits for it and shares its outcome. A request that fails after the refresh finished, with the token it replaced, just retries. Across tabs, the refresh runs under a Web Lock (waiting for it is bounded, as is the refresh request itself: 10 seconds), and a tab that finds a newer token in storage uses it. An answer that arrives after the member signed out, or in as someone else, is dropped, and a request is never retried with another account's token. Failed queries answered with a 4xx are not retried by React Query, so a refused session does not multiply refreshes. The refresh outcome is one of: renewed (retry), ended (401 or 400 from `/auth/refresh`: clear and announce the sign-out), or unavailable (network, 5xx, 429: keep the session, throw the original error). `401 AUTH_REFRESH_RACE` means another request of this browser just rotated the token: wait a moment, use the token it stored or ask once more with the cookie as it is now, and never sign out.

**The signed-in user.** `AuthContext` keeps no user state of its own. `useMe(token)` reads `GET /api/auth/me` under the key `['auth', 'me', <account id from the token>]`, so one account's cached data is never shown to another. Sign-in seeds that entry from the answer. When the token changes to another account (a sign-in here, or in another tab) or goes away, every other cached query is reset, so components that are mounted drop the old data at once and refetch as the new account. `useAuth()` exposes `user`, `token`, `loading` and the actions (`login`, `verify2faLogin`, `register`, `logout`, `refreshUser`, `updateProfile`, `updatePassword`, OAuth, reset and verification).

**Signing out.** `logout()` always calls `POST /api/auth/logout`. For one device the server accepts no, an expired or a junk access token: it ends the session the refresh cookie (or body token) belongs to, always clears the cookie, which the page cannot do, and always answers 200, so the sign-out starts no renewal. With `{ allDevices: true }` a valid access token is required, otherwise it is a 401 and the cookie is not cleared. It waits at most 5 seconds, then clears the token, the query cache and any pending 2FA hand-off. For one device the clean-up always happens, even if the server cannot be reached or the session is already gone. "Everywhere" only completes when the server confirms. A change of password answers a new access token for the same session (`PUT /api/auth/password`); the client stores it and the other devices are signed out.

**Sessions.** `GET /api/auth/sessions` lists `{ id, current, userAgent, ipAddress, lastUsedAt, createdAt }`; `DELETE /api/auth/sessions/:id` ends one, `DELETE /api/auth/sessions/others` ends the others. The page is `/profile/sessions`.

**Redirects.** `?redirect=` goes through `safeRedirectPath` (`src/lib/safeRedirect.ts`): one same-site path only. Absolute URLs, `//host`, backslashes, control characters, encoded forms of those and the sign-in pages themselves are refused and the member lands on their default page. The sign-in page, the second factor step and the Google and GitHub callbacks all use it; a callback reads the page the member was heading for from `sessionStorage`, written (after the same check) before leaving for the provider.

**Callbacks.** The Google and GitHub callbacks remove the token or code from the address bar before calling the API and leave with `router.replace`, so Back cannot run them again. Not yet in place (tracked as a known gap on the API side too): an OAuth `state` check for GitHub and a nonce for the Google id token.

**Tests.** Unit: `src/lib/__tests__/authRefresh.test.ts`, `fetchApiAuth.test.ts`, `authErrors.test.ts`, `safeRedirect.test.ts`, `src/context/__tests__/AuthContext.test.tsx`. End to end with `page.route` mocks: `e2e/auth-session.spec.ts` (the mock API is `e2e/auth-mocks.ts`).

### Authorization

- Role-based: `user`, `moderator`, `admin`, `owner`
- `authorize(...roles)` middleware restricts to specific roles
- `isAdmin` requires `admin` or `owner`
- `isModerator` requires `moderator`, `admin`, or `owner`
- `optionalAuth` sets `req.user` if token present but does not require it

---

## Real-Time Communication

### Socket.IO

```
Client (NotificationProvider)
    |
    v
socket.handshake.auth = { token: JWT }
    |
    v
Socket.IO Server (src/socket.js)
    |
    +-- Authenticates via JWT on connection
    +-- Joins user-specific room
    +-- Redis adapter for multi-instance support
    |
    v
Server emits events:
    - notification (new notification)
    - notification:read (mark as read)
    - online-status (presence updates)
```

The Socket.IO server initializes in `server.js` after the HTTP server starts. Authentication is performed via the token passed in `socket.handshake.auth`. The Redis adapter enables horizontal scaling across multiple API instances.

---

## Caching Strategy

### Server-Side (Redis)

| Cache Target | TTL | Invalidation |
|---|---|---|
| Blog list | 5 min | On blog create/update/delete |
| Blog detail | 2 min | On blog update/delete |
| Category stats | 10 min | On blog create/delete |
| Forum list | 5 min | On discussion create/update |
| Search results | 1 min | Time-based expiry |
| Rate limit counters | 1-60 min | Auto-expire |

### Client-Side (React Query)

- Default stale time: configured per query
- Background refetch on window focus
- Deduplication of concurrent identical requests
- Optimistic updates for like/bookmark toggles
- Cache persisted in memory (cleared on page refresh)

---

## Deployment Architecture

### Docker Compose (Production, planned)

> Not in either repository yet. `thecyberhub-core` ships a `docker-compose.yml` that starts only MongoDB and Redis for local development. A full-stack compose file (API and frontend containers) is still to be written; the layout below is the intended shape.

```
docker-compose.yml
  |
  +-- mongodb (mongo:7)
  |     - Volume: mongo-data
  |     - Health check: mongosh ping
  |     - Memory limit: 2GB
  |
  +-- redis (redis:7-alpine)
  |     - Volume: redis-data
  |     - Health check: redis-cli ping
  |     - Memory limit: 512MB
  |
  +-- api (thecyberhub-core)
  |     - Port: 5001:5001
  |     - Depends on: mongodb, redis (healthy)
  |     - Health check: HTTP GET /api/health
  |     - Memory limit: 1GB
  |
  +-- frontend (TheCyberHub)
        - Port: 3000:3000
        - Depends on: api
        - Health check: HTTP GET /
        - Memory limit: 1GB
```

### CI/CD (GitHub Actions)

```
Push / PR to main or develop
    |
    v
Lint (ESLint)
    |
    v
Type Check (tsc --noEmit)
    |
    v
Build (next build / tsc)
    |
    v
Test (Vitest / Jest with MongoDB service container)
    |
    v
Deploy (on merge to main)
```

### Health Checks

The API exposes four health endpoints:

- `GET /api/health` -- basic health status
- `GET /api/health/live` -- liveness probe (is the process running?)
- `GET /api/health/ready` -- readiness probe (are dependencies connected?)
- `GET /api/health/detailed` -- full health report (DB, Redis, memory, uptime)

### Graceful Shutdown

The server handles `SIGTERM` and `SIGINT` signals:
1. Stops accepting new connections
2. Closes MongoDB connection
3. Exits cleanly
4. Force-exits after 10 second timeout if shutdown hangs

---

## Security Architecture

### Frontend Security

- **DOMPurify** sanitizes all `dangerouslySetInnerHTML` content
- **CSP headers** via Next.js config
- **HSTS** enforced in production
- No direct `localStorage` access outside `tokenStore`

### Backend Security

- **Helmet** sets security headers (CSP, X-Frame-Options, X-Content-Type-Options, etc.)
- **express-mongo-sanitize** strips `$` and `.` from request data to prevent NoSQL injection
- **hpp** prevents HTTP parameter pollution
- **Custom input sanitization** middleware strips XSS payloads from request bodies
- **7 specialized rate limiters**: API, auth (with progressive delays + account lockout), 2FA, registration, password reset, search, upload, blog/forum/feed creation, general mutation
- **Joi validation** on all mutating endpoints (body, params, and query)
- **bcrypt** with 12 salt rounds for password hashing
- **JWT token rotation** on refresh (old refresh tokens are invalidated)
- **httpOnly cookies** for refresh tokens (not accessible via JavaScript)

### Error Handling

- Custom `ApiError` class hierarchy with error codes
- Global error handler strips stack traces in production
- Request ID tracking for debugging
- Structured logging via Winston (no `console.log` in production)
- Sentry integration for error tracking and alerting
