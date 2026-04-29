# Round 53e — Observability (Sentry)

End-to-end Sentry wiring for the FastAPI backend and Expo / React Native
frontend, with strict PII scrubbing and a DSN-driven kill switch.

## Why
We had:
- ✅ Correct math (paise + invariant)
- ✅ Atomic + idempotent writes
- ✅ Concurrency safety
- ✅ Side-effects-after-commit

…but **zero visibility** when something goes wrong in production. Sentry
closes that loop: error → capture → reproduce → test → prevent.

## Kill switch (no DSN → no-op)

| Env var                              | Default | Effect when empty |
|--------------------------------------|---------|-------------------|
| `SENTRY_DSN_BACKEND`                 | unset   | backend init no-op, scrubber unused |
| `EXPO_PUBLIC_SENTRY_DSN_FRONTEND`    | unset   | frontend init no-op |
| `APP_ENV` / `EXPO_PUBLIC_APP_ENV`    | `dev`   | env tag |
| `RELEASE` / `EXPO_PUBLIC_RELEASE`    | unset   | release tag (recommend `git rev-parse --short HEAD` at build) |
| `SENTRY_TRACES_SAMPLE_RATE`          | `0.2`   | 20% perf trace sampling |
| `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | `0.2` | mobile traces sampling |

Local dev with all envs unset: SDK initialises in no-op mode, ships
nothing, but `SentryContextMiddleware` still adds `X-Request-Id` to
every response (useful for plain-log correlation).

## Backend

**Module:** `backend/core/observability.py`

- `init_sentry()` — DSN-gated init with `FastApiIntegration` + `StarletteIntegration`
- `_before_send` — last-line PII scrubber: filters `Authorization`/`Cookie`/`X-Auth-Token`,
  hashes phones/emails/OTP/JWTs (sha256 first 8 hex), drops password/PIN entirely,
  recursively walks `data` / `extras` / `contexts` / `tags`, drops raw body
- `SentryContextMiddleware` — per-request scope tags: `request_id`, `endpoint`,
  `method`, `idempotency_key_h`, `user_id`. Sets `X-Request-Id` response header.
- `capture_silenced(exc, tag, extras)` — wraps `Sentry.captureException` with a
  `silenced=true` tag for swallowed errors (post-commit hooks, cache writes, etc.)

**Wiring:** `backend/server.py` calls `init_sentry()` and adds the middleware
right after `FastAPI()` instantiation. `backend/core/transactions.py` →
`PostCommitContext._fire()` reports failed hooks via `capture_silenced(...)`.

## Frontend

**Module:** `frontend/utils/observability.ts`

- `initSentry()` — DSN-gated init via `@sentry/react-native`. PII scrubber
  in `beforeSend` strips request bodies/cookies/auth headers.
- `setUserSafe(rawId)` — hashes id to 8 hex chars before `Sentry.setUser`
- `tagSafe(key, value)` / `breadcrumb(category, message, data)` — convenience
  helpers that no-op when SDK is uninitialised.

**Wiring:** `frontend/app/_layout.tsx` calls `initSentry()` at module import
time. `frontend/utils/api.ts` axios response interceptor adds an `api`
breadcrumb on every failure (status + correlated `X-Request-Id`).

## What's captured

| Source                          | Example                          |
|---------------------------------|----------------------------------|
| Unhandled FastAPI exceptions    | 500s, missing exception handlers |
| Hook failures (silenced before) | WS broadcast crash, cache write fail |
| Frontend JS runtime errors      | render exceptions caught by SDK  |
| API failures (frontend)         | breadcrumbs with status+request_id |

## What's NEVER sent

- Phones, emails, OTPs (hashed to `sha8:xxxxxxxx`)
- Passwords, PINs (`[FILTERED]`)
- `Authorization` / `Cookie` headers (`[FILTERED]`)
- Raw request bodies (dropped)

## Verification

20 tests in `backend/tests/test_round53e_observability.py` cover:
- `_hash8` determinism + 8-hex-char output
- `_scrub_mapping` for phone/otp/password/pin/token, nested dicts, list-of-dicts,
  case-insensitive key match, safe-keys-untouched
- `_before_send` end-to-end — strips Auth/Cookie, hashes data fields,
  drops raw body, filters user.phone/email, scrubs tags+extras
- `init_sentry()` returns False when DSN unset / blank

Live: `curl -D -` against any endpoint shows `x-request-id` header.
Force a 5xx → with DSN set, event appears in Sentry tagged with
`request_id`, `endpoint`, `method`. With DSN unset, nothing ships.

## Turning it on

1. Create two Sentry projects (one Python, one React Native).
2. Set env vars on the running deployment:
   ```
   SENTRY_DSN_BACKEND=https://xxx@oNNN.ingest.sentry.io/PPP
   APP_ENV=staging
   RELEASE=$(git rev-parse --short HEAD)
   SENTRY_TRACES_SAMPLE_RATE=0.2
   ```
3. For the mobile app, set the `EXPO_PUBLIC_*` equivalents in `frontend/.env`
   and rebuild (env values are inlined at bundle time).
4. Restart backend; force one error to verify event arrives.
