# MintU — Money, simplified

Native-feeling personal finance app for India. Auto-imports bank SMS + Gmail
expense emails, runs an AI coach, gamifies saving via streaks/coins, and
splits expenses with friends via UPI / Razorpay.

**Stack**: Expo / React Native (frontend), FastAPI + MongoDB (backend),
Razorpay (payments), Emergent LLM key (OpenAI / Gemini / Claude routed
through one universal key).

---

## 🛠️ First-Time Setup (one-time per clone)

> 🚨 **Required step — install the git hooks:**
> ```bash
> bash /app/scripts/install-git-hooks.sh
> ```
> This wires a pre-commit `tsc --noEmit` guard into your local git.
> Without it, you can commit TypeScript regressions that the CI will
> later reject. Idempotent — safe to re-run after every fresh clone.

Then:

```bash
# Backend deps
cd /app/backend && pip install -r requirements.txt

# Frontend deps
cd /app/frontend && yarn install

# Verify type-safety baseline (should print "Done" with no errors)
cd /app/frontend && yarn typecheck
```

Services are managed by `supervisor`. Start everything:

```bash
sudo supervisorctl restart all
```

Frontend on http://localhost:3000 · Backend on http://localhost:8001/api

---

## 🧪 Type-Safety Guard

The repo has **zero TypeScript errors** as of Round 49 (Apr 25 2026). A
two-layer guard keeps it that way:

1. **Pre-commit hook** — runs `tsc --noEmit` on `frontend/` before
   every commit. Bypassable in emergencies via `git commit --no-verify`.
2. **GitHub Actions** — `.github/workflows/typecheck.yml` runs the same
   check on every push and PR. CI fails on any error.

Manual checks:

```bash
cd /app/frontend && yarn typecheck         # one-shot
cd /app/frontend && yarn typecheck:watch   # active development
```

Full doc: `/app/docs/TYPECHECK_GUARD.md`

---

## 🔑 API Keys & Environment

### Backend (`/app/backend/.env`)

| Key | Purpose | Status |
|---|---|---|
| `MONGO_URL` | MongoDB connection | ✅ Configured |
| `EMERGENT_LLM_KEY` | OpenAI + Gemini + Claude (universal) | ✅ Active |
| `RAZORPAY_KEY_ID` / `_KEY_SECRET` | Payments | 🟡 Test mode (`rzp_test_*`) |
| `RAZORPAY_PLAN_ID_*` | Subscription plan IDs (Lite/Pro/Elite) | ⚠️ Empty — required for live |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signing | ⚠️ Empty — required for live |
| `FCM_SERVER_KEY`, `APNS_*` | Push notifications | ❌ Not yet wired |
| `MSG91_*` / `TWILIO_*` | Real SMS OTP | ❌ Not yet wired (mock OTP active) |

### Frontend (`/app/frontend/.env`)

Protected — do **not** edit `EXPO_PACKAGER_PROXY_URL`, `EXPO_PACKAGER_HOSTNAME`,
or `EXPO_BACKEND_URL`. These are set by the platform.

---

## 💳 Switching Razorpay to LIVE Mode

The frontend is already mode-agnostic — no code changes needed. The switch
is **backend `.env` only**, plus Razorpay account housekeeping:

1. Complete Razorpay KYC (PAN, GST, bank account, business address).
2. From the Razorpay Dashboard (Live mode toggle, top-right), copy:
   - `Settings → API Keys` → Generate live keys.
   - `Subscriptions → Plans` → create `mintu_lite`, `mintu_pro`, `mintu_elite`
     plans. Copy each `plan_id`.
   - `Settings → Webhooks` → add a webhook for events
     `subscription.activated`, `subscription.charged`, `subscription.cancelled`,
     `subscription.completed` pointing at
     `https://<your-prod-host>/api/premium/razorpay-webhook`. Copy the
     signing secret.
3. Update `/app/backend/.env`:
   ```ini
   RAZORPAY_KEY_ID=rzp_live_********
   RAZORPAY_KEY_SECRET=********
   RAZORPAY_PLAN_ID_LITE=plan_********
   RAZORPAY_PLAN_ID_PRO=plan_********
   RAZORPAY_PLAN_ID_ELITE=plan_********
   RAZORPAY_WEBHOOK_SECRET=********
   ```
4. Restart backend: `sudo supervisorctl restart backend`.

The 503-fallback path (`PlansView.tsx:44`) auto-disables once plan IDs are
populated; the app starts opening real UPI AutoPay mandates immediately.

---

## 🧰 Common Commands

```bash
# Restart services
sudo supervisorctl restart backend
sudo supervisorctl restart expo

# Type-check
cd /app/frontend && yarn typecheck

# Backend tests
cd /app/backend && pytest

# Lint
cd /app/frontend && yarn lint
```

---

## 📂 Repo Layout

```
/app
├── backend/                 FastAPI + MongoDB
│   ├── routers/             API endpoints (auth, premium, split, …)
│   ├── core/                lifecycle, indexes, event bus, ledger
│   └── services/            domain logic (LLM, OCR, etc.)
├── frontend/                Expo / React Native
│   ├── app/                 expo-router file-based routes
│   ├── components/          reusable UI
│   ├── store/               Zustand stores (auth, theme, lang)
│   ├── utils/               makeStyles, theme, swrGet, sessionReset, …
│   ├── constants/           storageKeys (per-user vs device-scoped)
│   └── services/            backend API clients
├── scripts/                 install-git-hooks.sh, pre-commit-typecheck.sh
├── docs/                    TYPECHECK_GUARD.md, SYSTEM_MAP.md, …
└── .github/workflows/       CI pipelines (typecheck.yml)
```

---

## 🔒 Security Notes

- All per-user device state is wiped on every login/logout/cold-start
  via `utils/clearSessionState.ts` (Round 48b — see
  `constants/storageKeys.ts` for the canonical key registry).
- Backend enforces per-user data isolation via `Depends(get_current_user)`
  on every protected endpoint. Cache keys are user-scoped.
- App-lock PIN is hashed + salted in `expo-secure-store`. Biometric
  fallback via `expo-local-authentication`.

---

## 🤝 Contributing Quickstart

1. Clone repo.
2. `bash /app/scripts/install-git-hooks.sh` — required.
3. `cd frontend && yarn typecheck` — should pass.
4. Make your change.
5. Commit — pre-commit hook runs `tsc --noEmit` automatically.
6. Push — GitHub Actions runs the same check.
7. PR.


---

## 🚀 Deployment Pipeline (Round 51b)

Every container boot of the preview/production environment is handled by
a 3-layer bootstrap so the app loads in <500 ms instead of waiting on
Metro to dev-bundle.

### Layer 1 — Image build time (CI)

When deploying via Emergent (or any CI), set one of these env vars before
`yarn install`:

```bash
EMERGENT_DEPLOY=1 yarn install   # Emergent pipeline
CI=true            yarn install   # Generic CI
BUILD_WEB=1        yarn install   # Explicit local pre-build
```

The `postinstall` hook (`frontend/scripts/postinstall_build_web.js`) will:

1. Compute a SHA-256 of all source files (`app/`, `components/`, `utils/`,
   `store/`, `constants/`, plus `package.json`, `babel.config.js`,
   `metro.config.js`, `app.json`).
2. If the hash matches `dist/.build_hash` and `dist/index.html` exists →
   skip the build (idempotent).
3. Otherwise run `yarn build:web` (≈ 20 s on this hardware) and write
   the new hash file.
4. If the build fails → log the error and exit 0 (never breaks `yarn
   install`); the runtime startup hook will retry.

**Without** any of those env vars, `yarn install` is a silent no-op for
dist/ — local developers don't pay the build cost.

### Layer 2 — Container start time

Supervisor brings up `[program:web_switcher]` (configured in
`/etc/supervisor/conf.d/supervisord_web_switcher.conf`). It's a one-shot
program that:

1. Sleeps 4 s for supervisor RPC to settle.
2. Calls `/app/scripts/startup.sh`, which:
   - Re-checks the source hash; rebuilds dist/ if drifted.
   - `supervisorctl stop expo` (the dev server in the read-only base config).
   - `supervisorctl start static_web` (our static server on port 3000).
3. Exits with code 0 — `autorestart=false` so it never re-fires.

### Layer 3 — Runtime serving

`/app/scripts/static_web_server.py` is a Python ThreadingHTTP server
that serves `/app/frontend/dist/` on port 3000 with:

- gzip on-the-fly for text resources > 1 KB
- `Cache-Control: public, max-age=31536000, immutable` for hashed JS/CSS
- `Cache-Control: no-cache, no-store, must-revalidate` for `index.html`
- SPA fallback (`<route>.html` → `/index.html`)
- Defensive 404 on `/api/*` (defers to backend on port 8001 via ingress)
- `/health` endpoint for k8s liveness probes
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`

### Manual trigger (e.g. after a hot patch)

```bash
bash /app/scripts/startup.sh           # checks hash, rebuilds if needed,
                                        # swaps to static server
bash /app/scripts/web_switcher.sh      # same, with supervisor wait
yarn build:web                          # raw build, no swap
```

### Fallbacks

If anything goes wrong:

- `yarn build:web` fails in CI → `postinstall` exits 0; runtime
  rebuilds at first boot
- Runtime rebuild fails → previous `dist/` stays in place; static_web
  keeps serving old build
- No `dist/` at all → static_web fails to start, expo dev server keeps
  running as ultimate fallback (slow but app stays up)


