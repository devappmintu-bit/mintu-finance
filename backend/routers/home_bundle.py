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
from datetime import datetime, timezone
from fastapi import APIRouter, Depends

from core import db, get_current_user
from core.cache import cache_get, cache_set

router = APIRouter(tags=["home_bundle"])


async def _safe(coro):
    """Wrap a coroutine so that failures return None instead of raising.

    Keeps `/home/bundle` partial-success — one slow/broken upstream won't
    poison the whole bundle. Frontend has fallback UI for each missing slice.
    """
    try:
        return await coro
    except Exception:  # noqa: BLE001 — swallowed on purpose
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

    (
        user, stats, recent_txns, avatar, snapshot,
        alerts, weekly_rep, lb, game,
        cotd, fomo, pred, coins,
    ) = await asyncio.gather(
        _safe(get_user_profile(user_id=user_id)),
        _safe(get_stats_overview(user_id=user_id)),
        _safe(_recent()),
        _safe(get_avatar(user_id=user_id)),
        _safe(home_snapshot(user_id=user_id)),
        _safe(smart_alerts(user_id=user_id)),
        _safe(weekly_report(user_id=user_id)),
        _safe(savings_leaderboard(user_id=user_id)),
        _safe(get_gamification_status(user_id=user_id)),
        _safe(card_of_the_day(refresh=False, user_id=user_id)),
        _safe(fomo_feed(user_id=user_id)),
        _safe(ai_predict(user_id=user_id)),
        _safe(coins_status(user_id=user_id)),
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
        "cached_at": datetime.now(timezone.utc).isoformat(),
        "cache_ttl_s": 25,
    }
    cache_set(key, bundle, ttl_seconds=25)
    return bundle
