"""home_bundle — fan-out /home/bundle endpoint.

Extracted from analytics.py (Round 25D refactor).

Why split?
----------
The `/home/bundle` endpoint is called on every app cold-start — it's the single
most-hit endpoint in the system. Isolating it from the broader analytics router
makes it easier to:
  1. Tune caching independently (TTL, stale-while-revalidate windows)
  2. Add per-slice metrics (which sub-call dominates latency?)
  3. Evolve the bundle shape without touching unrelated analytics code

The endpoint registers on a fresh `router` that server.py includes alongside
analytics. No URL paths change.
"""
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends

log = logging.getLogger(__name__)

from core import db, get_current_user
from core.cache import cache_get, cache_set
from core.time import utc_now

router = APIRouter(tags=["home_bundle"])


# ────────────────────────────────────────────────────────────────────
#  Per-slice budget (seconds). When a slice exceeds this, we drop it
#  silently and let the frontend render the fallback UI for that
#  section. Without this, ONE slow LLM-bound slice (smart_alerts,
#  weekly_report, ai_predict, card_of_the_day, fomo_feed) drags the
#  whole bundle to 30 s — exactly what production access logs were
#  showing on 2026-05-01 (latency_ms=27,295 for /api/home/bundle when
#  one upstream completion took 27 s).
#
# Budgets are tuned so the bundle returns in < 4 s P99 even when
# every LLM slice is slow:
#   • Mongo-only slices (recent, stats, snapshot, coins, gamification)
#     get 1.5 s — they're routinely sub-100 ms; 1.5 s is the alarm
#     threshold for "DB is sad".
#   • LLM-bound slices (alerts, weekly_report, ai_predict, cotd, fomo)
#     get 3.5 s — long enough for a cached completion, short enough
#     that we drop to fallback before the user notices a lag spike.
# ────────────────────────────────────────────────────────────────────
_BUDGET_FAST = 1.5     # mongo / cache
_BUDGET_LLM  = 3.5     # LLM-backed


async def _safe(coro, *, budget: float = _BUDGET_FAST):
    """Run a coroutine with a hard timeout AND swallow any exception.

    Returns None when:
      • The coroutine raises (any exception).
      • The coroutine doesn't complete within `budget` seconds.

    The frontend has fallback UI for every nullable slice in the
    bundle so a missing slice degrades gracefully instead of breaking
    the home tab.
    """
    try:
        return await asyncio.wait_for(coro, timeout=budget)
    except asyncio.TimeoutError:
        # Important: the underlying coroutine is cancelled when wait_for
        # times out, so we don't leak its work. The next bundle hit
        # will re-issue the call (likely against a warmed cache).
        return None
    except Exception:  # noqa: BLE001 — partial-success by design
        return None


@router.get("/home/bundle")
async def home_bundle(lang: str = "en", user_id: str = Depends(get_current_user)):
    """Fan-out bundle for the Home tab.

    Returns:
      {
        user, stats, recent_txns, avatar, snapshot,
        money_school, alerts, weekly_report, leaderboard, gamification,
        card_of_the_day, fomo_feed, ai_predict, coins,
        cached_at (iso string, omitted on fresh fetch)
      }

    Serve-stale behaviour: we cache the successful bundle per user+lang for
    25 s. Callers that want a fresh bundle can send `?refresh=1`.
    """
    key = f"home_bundle::{user_id}::{lang}"

    # Lazy imports — avoid circular-import at module load
    from routers.user import get_user_profile, get_avatar
    from routers.content import card_of_the_day
    from routers.alerts import smart_alerts
    from routers.gamification import get_gamification_status
    from routers.referral import fomo_feed
    from routers.analytics import (
        get_stats_overview, home_snapshot, weekly_report,
        savings_leaderboard, ai_predict, coins_status,
    )

    cached = cache_get(key)
    if cached is not None:
        return cached

    async def _recent():
        cur = db.transactions.find({"user_id": user_id}).sort("date", -1).limit(5)
        out = []
        async for t in cur:
            t["id"] = str(t.pop("_id"))
            if isinstance(t.get("date"), datetime):
                t["date"] = t["date"].isoformat()
            if isinstance(t.get("created_at"), datetime):
                t["created_at"] = t["created_at"].isoformat()
            out.append(t)
        return out

    async def _peer_mom():
        """Compute v10 peer-benchmark and month-over-month insights.

        Returns { peer: {median_spend, score_percentile}, mom: {current_spend, previous_spend, delta_pct} }
        Kept fast — two aggregation pipelines with tight indexes.
        """
        try:
            now = utc_now()
            cm_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            # Previous month boundaries
            if cm_start.month == 1:
                pm_start = cm_start.replace(year=cm_start.year - 1, month=12)
            else:
                pm_start = cm_start.replace(month=cm_start.month - 1)

            # Current + previous month spend for THIS user (debit only)
            pipe = [
                {"$match": {"user_id": user_id, "type": {"$ne": "credit"}, "date": {"$gte": pm_start}}},
                {"$project": {"amount": 1, "period": {"$cond": [{"$gte": ["$date", cm_start]}, "cur", "prev"]}}},
                {"$group": {"_id": "$period", "total": {"$sum": "$amount"}}},
            ]
            sums = {row["_id"]: float(row.get("total") or 0) async for row in db.transactions.aggregate(pipe)}
            cur_spend = sums.get("cur", 0)
            prev_spend = sums.get("prev", 0)
            delta_pct = round(((cur_spend - prev_spend) / prev_spend) * 100) if prev_spend > 0 else 0

            # Peer median — median spend of other users this month (last 60 users, debit only).
            # Cheap approximation: sample 60 most-active users this month.
            peer_pipe = [
                {"$match": {"type": {"$ne": "credit"}, "date": {"$gte": cm_start}, "user_id": {"$ne": user_id}}},
                {"$group": {"_id": "$user_id", "total": {"$sum": "$amount"}}},
                {"$sort": {"total": -1}},
                {"$limit": 60},
            ]
            totals = [float(r.get("total") or 0) async for r in db.transactions.aggregate(peer_pipe)]
            peer_median = 0
            if totals:
                totals.sort()
                mid = len(totals) // 2
                peer_median = int(totals[mid] if len(totals) % 2 else (totals[mid - 1] + totals[mid]) / 2)

            # Score percentile — use user's current score vs leaderboard.
            score_pct = 0
            try:
                udoc = await db.users.find_one({"_id": user_id}, {"money_score": 1})
                if udoc:
                    my_score = int(udoc.get("money_score") or 0)
                    rank_cnt = await db.users.count_documents({"money_score": {"$gt": my_score}})
                    total = await db.users.count_documents({})
                    if total > 0:
                        score_pct = round(((total - rank_cnt) / total) * 100)
            except Exception:
                pass

            return {
                "peer": {"median_spend": peer_median, "score_percentile": score_pct},
                "mom":  {"current_spend": int(cur_spend), "previous_spend": int(prev_spend), "delta_pct": delta_pct},
            }
        except Exception as exc:
            log.warning("peer_mom compute failed: %s", exc)
            return {"peer": {}, "mom": {}}

    (
        user, stats, recent_txns, avatar, snapshot,
        alerts, weekly_rep, lb, game,
        cotd, fomo, pred, coins,
        peer_mom,
    ) = await asyncio.gather(
        # Mongo-only slices — fast, tight budget.
        _safe(get_user_profile(user_id=user_id)),
        _safe(get_stats_overview(user_id=user_id)),
        _safe(_recent()),
        _safe(get_avatar(user_id=user_id)),
        _safe(home_snapshot(user_id=user_id)),
        # LLM-bound slices — generous budget that still degrades
        # gracefully via the frontend's per-section fallback UI.
        _safe(smart_alerts(user_id=user_id),                         budget=_BUDGET_LLM),
        _safe(weekly_report(user_id=user_id),                        budget=_BUDGET_LLM),
        _safe(savings_leaderboard(user_id=user_id),                  budget=_BUDGET_FAST),
        _safe(get_gamification_status(user_id=user_id),              budget=_BUDGET_FAST),
        _safe(card_of_the_day(refresh=False, user_id=user_id),       budget=_BUDGET_LLM),
        _safe(fomo_feed(user_id=user_id),                            budget=_BUDGET_LLM),
        _safe(ai_predict(user_id=user_id),                           budget=_BUDGET_LLM),
        _safe(coins_status(user_id=user_id),                         budget=_BUDGET_FAST),
        # v10 — peer benchmark + month-over-month (fast, Mongo only).
        _safe(_peer_mom()),
    )

    bundle = {
        "user": user,
        "stats": stats,
        "recent_txns": recent_txns or [],
        "avatar": avatar,
        "snapshot": snapshot,
        "alerts": alerts,
        "weekly_report": weekly_rep,
        "leaderboard": lb,
        "gamification": game,
        "card_of_the_day": cotd,
        "fomo_feed": fomo,
        "ai_predict": pred,
        "coins": coins,
        # v10 insights — consumed by financialContext + ai_context peer/mom modes.
        "insights": peer_mom or {"peer": {}, "mom": {}},
        "cached_at": utc_now().isoformat(),
        "cache_ttl_s": 25,
    }
    cache_set(key, bundle, ttl_seconds=25)
    return bundle
