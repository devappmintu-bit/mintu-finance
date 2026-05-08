"""R100C — Demo user data cleanup.

Wipes regression-test pollution from the demo user (phone 9876543210)
across every owned collection. Idempotent: safe to re-run.

Discovery context: end-to-end audit found the demo user's surface had
visible test artifacts ("Round 99D regression test latte", "diff-keys"
merchant, 13 pre-seeded goals including "Warn-mode Goal" ×2, 21 split
groups named "Smoke/Audit/R45", fake "Priya settled" notifications,
gamification leftovers in coin_ledger / streak_freeze_events). All of
those rendered through the standard user-facing API, so any first-time
viewer of the demo creds would see them and lose trust.

Usage:
    python3 scripts/clean_demo_user.py [--dry-run] [--phone 9876543210]
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Any, Dict, List, Tuple

from dotenv import load_dotenv
from pymongo import MongoClient

# Load /app/backend/.env explicitly — running from any cwd is fine.
HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, "..", ".env"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Count only, don't delete.")
    ap.add_argument("--phone", default="9876543210", help="Phone of demo user.")
    args = ap.parse_args()

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "mintu_database")
    if not mongo_url:
        print("ERROR: MONGO_URL not set", file=sys.stderr)
        return 2

    client = MongoClient(mongo_url)
    db = client[db_name]

    user = db.users.find_one({"phone": args.phone})
    if not user:
        print(f"ERROR: no user with phone {args.phone}", file=sys.stderr)
        return 1

    uid = str(user["_id"])
    print(f"Demo user: id={uid} name={user.get('name')} phone={args.phone}")
    print(f"Mode: {'DRY RUN' if args.dry_run else 'WIPE'}")
    print()

    # (collection, query) — query identifies docs the demo user OWNS or is
    # the only party in. We do NOT touch shared docs where another real
    # user is involved (e.g. split_settlements between two real users).
    targets: List[Tuple[str, Dict[str, Any]]] = [
        ("transactions",            {"user_id": uid}),
        ("goals",                   {"user_id": uid}),
        ("budgets",                 {"user_id": uid}),
        ("budget_alerts",           {"user_id": uid}),
        ("draft_expenses",          {"user_id": uid}),
        ("cash_entries",            {"user_id": uid}),
        ("subscriptions",           {"user_id": uid}),
        ("recurring_subscriptions", {"user_id": uid}),
        ("recurring_expenses",      {"user_id": uid}),
        ("recurring_splits",        {"user_id": uid}),

        # Split surfaces — including any group the demo user created OR
        # is a member of. The audit found 21 demo-only test groups; this
        # nukes them all.
        ("split_groups",            {"$or": [
                                        {"created_by": uid},
                                        {"members.user_id": uid},
                                    ]}),
        ("split_expenses",          {"$or": [
                                        {"paid_by": uid},
                                        {"created_by": uid},
                                    ]}),
        ("split_settlements",       {"$or": [
                                        {"from_user_id": uid},
                                        {"to_user_id": uid},
                                    ]}),
        ("split_reminders",         {"user_id": uid}),
        ("settle_locks",            {"user_id": uid}),
        ("pending_settlement_nudges", {"user_id": uid}),
        ("settlements",             {"$or": [
                                        {"from_user_id": uid},
                                        {"to_user_id": uid},
                                    ]}),

        # Notifications — fake "Priya settled", streak push, voucher.
        ("notifications_feed",      {"user_id": uid}),
        ("notifications_log",       {"user_id": uid}),
        ("sent_notifications",      {"user_id": uid}),

        # Gamification leftovers — these were "stripped" but the writes
        # never stopped. Wiping owns them per-user; the writers can be
        # killed in a separate sprint.
        ("coin_ledger",             {"user_id": uid}),
        ("coins_wallet",            {"user_id": uid}),
        ("coach_rewards",           {"user_id": uid}),
        ("coach_trigger_history",   {"user_id": uid}),
        ("user_badges",             {"user_id": uid}),
        ("rewards_wallet",          {"user_id": uid}),
        ("reward_spins",            {"user_id": uid}),
        ("streak_freeze_events",    {"user_id": uid}),
        ("mission_claims",          {"user_id": uid}),

        # Derivatives & caches that shadow the wiped data.
        ("agent_memory",            {"user_id": uid}),
        ("user_coach_context",      {"user_id": uid}),
        ("score_history",           {"user_id": uid}),
        ("school_progress",         {"user_id": uid}),
        ("ledger_transactions",     {"user_id": uid}),
        ("payment_orders",          {"user_id": uid}),

        # Privacy hygiene: clear ephemeral / debug rows for this user.
        ("idempotency_keys",        {"user_id": uid}),
        ("ab_events",               {"user_id": uid}),
        ("audit_logs",              {"user_id": uid}),
    ]

    total_found = 0
    total_deleted = 0

    for col, q in targets:
        try:
            n = db[col].count_documents(q)
        except Exception as e:
            print(f"  {col:35s}  COUNT ERROR: {e}")
            continue
        if n == 0:
            continue
        total_found += n
        verb = "WOULD DELETE" if args.dry_run else "deleted"
        if args.dry_run:
            print(f"  {col:35s}  {n:6d}  {verb}")
        else:
            r = db[col].delete_many(q)
            total_deleted += r.deleted_count
            ok = "✓" if r.deleted_count == n else "!"
            print(f"  {col:35s}  {n:6d}  {verb} {r.deleted_count} {ok}")

    print(f"  {'-' * 60}")
    print(f"  {'TOTAL':35s}  {total_found:6d} found"
          + (f" / {total_deleted} deleted" if not args.dry_run else ""))

    # Reset the user's onboarding-derived fields so the next login flow
    # is truthful (no "Welcome back" for a freshly-wiped account).
    if not args.dry_run:
        db.users.update_one(
            {"_id": user["_id"]},
            {"$unset": {
                "income_monthly": "",
                "persona": "",
                "tier": "",
                "starter_pack": "",
                "onboarded_at": "",
            }},
        )
        print()
        print("  users: cleared income/persona/tier/starter_pack/onboarded_at")

    print()
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
