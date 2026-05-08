"""core/router_registry.py — Round 53h

Domain-router registration extracted from ``server.py`` so the
bootstrap file stays thin and adding a new router is a one-line
change in this list (instead of two: one in the import, one in
the registration loop).

The import + registration order matches the previous server.py
verbatim — this is a structural refactor only, no semantics
change.

Usage (in server.py):
    from core.router_registry import register_domain_routers
    register_domain_routers(api_router)
"""
from __future__ import annotations

from fastapi import APIRouter


def register_domain_routers(api_router: APIRouter) -> None:
    """Mount every domain router under the given parent (typically the
    ``/api`` router). Imports are intentionally local so a typo or
    missing dep in one router doesn't break the whole import chain.
    """
    from routers import (
        auth as auth_router,
        auth_v2 as auth_v2_router,
        news as news_router,
        referral as referral_router,
        gamification as gamification_router,
        content as content_router,
        transactions as transactions_router,
        budgets as budgets_router,
        family as family_router,
        analytics as analytics_router,
        user as user_router,
        splits as splits_router,
        ai as ai_router,
        cash as cash_router,
        notifications as notifications_router,
        sms as sms_router,
        premium as premium_router,
        premium_reports as premium_reports_router,
        premium_subscriptions as premium_subscriptions_router,
        ab as ab_router,
        share as share_router,
        privacy as privacy_router,
        budgets_ext as budgets_ext_router,
        alerts as alerts_router,
        upi as upi_router,
        insights_ext as insights_ext_router,
        gmail_oauth as gmail_oauth_router,
        home_bundle as home_bundle_router,
        rewards as rewards_router,
        split_insights as split_insights_router,
        goals as goals_router,
        profile_identity as profile_identity_router,
        profile_engine as profile_engine_router,
        streak as streak_router,
        search as search_router,
        split_ws as split_ws_router,
        users as users_router,
        mascot as mascot_router,
        pending_nudges as pending_nudges_router,
        setu_aa as setu_aa_router,
        coach_v2 as coach_v2_router,
        notifications_v2 as notifications_v2_router,
        diagnostic_score as diagnostic_score_router,
        admin_simulate as admin_simulate_router,
        onboarding as onboarding_router,
        subscriptions as subscriptions_router,
        pulse as pulse_router,
    )
    for r in (
        auth_router,
        auth_v2_router,
        news_router, referral_router, gamification_router, content_router,
        transactions_router, budgets_router, family_router, analytics_router,
        user_router, splits_router, ai_router, cash_router, notifications_router,
        sms_router, premium_router, premium_reports_router, premium_subscriptions_router,
        ab_router, share_router, privacy_router,
        budgets_ext_router, alerts_router, upi_router, insights_ext_router,
        gmail_oauth_router, home_bundle_router, rewards_router,
        split_insights_router, goals_router,
        profile_identity_router, profile_engine_router,
        streak_router, search_router, split_ws_router, users_router,
        mascot_router, pending_nudges_router,
        setu_aa_router, coach_v2_router,
        notifications_v2_router,
        diagnostic_score_router,
        admin_simulate_router,
        onboarding_router,
        subscriptions_router,
        pulse_router,
    ):
        api_router.include_router(r.router)


__all__ = ["register_domain_routers"]
