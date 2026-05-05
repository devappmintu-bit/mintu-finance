# MintU Backend Router Architecture

> **Round 95 audit reveal**: the previous "65 backend routers, target ≤30"
> headline metric was **misleading**. Most "extra" files are sub-modules
> registering on a shared `APIRouter` via Python's import-side-effect
> pattern. The actual routing surface is far cleaner than the file count
> suggests.

## The aggregator pattern

For domains with many endpoints (AI, Splits) we use this layout:

```
routers/
  <domain>_common.py    ← defines `router` and `api_router` once
  <domain>_<sub>.py     ← @router.get / @api_router.post decorators here
  <domain>.py           ← aggregator: re-exports `router`, imports subs
```

The aggregator (e.g. `routers/ai.py`) does:

```python
from routers.ai_common import router, api_router  # noqa: F401
from routers import ai_insights     # noqa: F401  ← decorators register on import
from routers import ai_money_school # noqa: F401
... (etc)
```

`core/router_registry.py` mounts the aggregator. All sub-module endpoints
are reachable as if they lived in one file. Splitting them physically
keeps each file under ~500 LOC and groups by feature.

## Canonical map (Round 95)

| Domain      | Aggregator              | Sub-modules                             | Total endpoints | Canonical for new code? |
|-------------|-------------------------|-----------------------------------------|-----------------|-------------------------|
| AI Coach    | `coach_v2.py`           | (single file — Round 90+ rewrite)      | 7               | **YES**                 |
| AI Legacy   | `ai.py` (aggregator)    | `ai_common`, `ai_insights`, `ai_money_school`, `ai_coach`, `ai_voice`, `ai_agent`, `ai_context`, `ai_waste` | 17 across 8 files | NO — drift to coach_v2 |
| Splits      | `splits.py` (aggregator)| `split_common`, `split_groups`, `split_expenses`, `split_settle`, `split_reminders`, `split_activity`, `split_razorpay`, `split_insights`, `split_ws` | 42 across 9 files | YES (already aggregated)|
| Premium     | `premium.py`            | + `premium_coins`, `premium_invest`, `premium_reports`, `premium_subscriptions`, `premium_tax`, `premium_common` | 18 across 7 files | YES                     |
| Auth        | `auth_v2.py` (canonical)| `auth.py` (legacy OTP)                  | 12              | `auth_v2` for new flows |
| Notifications| `notifications_v2.py`  | `notifications.py` (legacy)             | 8               | `notifications_v2`      |
| Diagnostic  | `diagnostic_score.py`   | (single file, R92)                      | 1               | YES                     |
| Home Bundle | `home_bundle.py`        | (single file)                           | 1               | YES                     |

## Deprecation policy

Routers marked **deprecated** keep their endpoints alive (back-compat for
shipped clients) but new code MUST NOT add endpoints to them. The
canonical replacement is listed in the table above.

| Deprecated         | Canonical replacement |
|--------------------|-----------------------|
| `ai_coach.py`      | `coach_v2.py`         |
| `ai_agent.py`      | `coach_v2.py` (`/coach/chat` covers both legacy chat + agent-chat)|
| `ai_context.py`    | `coach_v2.py` (uses `coach_context.py` service internally)|
| `auth.py`          | `auth_v2.py` (per-device sessions, refresh tokens, sim-bypass) |
| `notifications.py` | `notifications_v2.py` (unified engine + 8 triggers)|

## Hard-killed (returns 410 Gone, do not call)

Round 92 brand-cleanup retired the gamification surfaces. These endpoints
exist only to return `410 Gone` so cached app-state on shipped clients
gets a clean error instead of a hard 404:

- `POST /api/coins/award`
- `GET  /api/coins/status`
- `GET  /api/leaderboard/savings | /unified | /friends`
- `GET  /api/streak/leaderboard`
- `GET  /api/leaderboard` (referral)
- `GET  /api/split/settlement-leaderboard`

## Adding a new endpoint — playbook

1. Find your domain in the canonical map. Use the **canonical** router.
2. If the canonical router has fewer than 8 routes, add yours directly there.
3. If it's getting big (≥8 routes), create a new sub-module
   (e.g. `<domain>_<feature>.py`), import from `<domain>_common`, and
   add an `import routers.<domain>_<feature>` line to the aggregator.
4. **Never** create a new top-level router file for a single endpoint —
   that's how we got 65 files. Use sub-modules instead.

## File-count reduction opportunities (low priority)

These are aesthetic, not architectural. Defer until the file count
*actually* hurts:

- `ai_voice.py` (1 route, 68 LOC) → could fold into `coach_v2.py`
- `ai_waste.py` (2 routes, 199 LOC) → could fold into `ai_insights.py`
- `split_insights.py` (1 route, 301 LOC) → could fold into `split_groups.py`
- `premium_invest.py` (1 route, 117 LOC) + `premium_tax.py` (1 route, 146 LOC) → could fold into `premium.py`

> Round 95 verdict: **don't do this now**. The risk of breaking working
> code outweighs the benefit of -4 files. Revisit when a domain
> actually develops new endpoints that span the existing files.
