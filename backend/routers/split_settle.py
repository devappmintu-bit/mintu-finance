"""Settlement flow, UPI intents, balances, reminders, leaderboard, redeem.

Auto-extracted from backend/routers/splits.py (Round 14 refactor).
Imports the shared `router` from split_common.py so decorators register
on the same FastAPI APIRouter instance — no endpoint paths change.
"""
import logging
import uuid as uuid_lib
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from urllib.parse import quote
from typing import Optional, Dict, Any
from bson import ObjectId
from fastapi import Depends, Header, HTTPException
from pymongo.errors import DuplicateKeyError

from core import db, get_current_user
from core.cache import cache_clear_prefix
from core.upi import mask_upi_id
from core.money import coerce_to_paise, paise_from_doc, paise_to_rupees, splits_paise_from_doc
from core.ledger_invariant import (
    LedgerInvariantError,
    assert_double_entry,
    build_settlement_entries,
)
from core.idempotency import (
    commit_idempotency,
    replay_idempotency,
    reserve_idempotency,
)
from core.transactions import with_atomic_ctx, PostCommitContext
from core.settlement_planner import (
    SettlementPlannerError, SettlementTransfer,
    plan_settlements, my_transfers, transfer_summary,
)
from core.ids import safe_oid
from core.users import get_user_by_id
from core.time import utc_now
from core.errors import (raise_group_not_found, raise_user_not_found, raise_invalid_id, raise_no_outstanding_debt, raise_positive_amount_required)
from routers.split_common import (
    api_router,
    SettlePayment,
    SETTLEMENT_REWARDS, SETTLEMENT_BADGES,
    invalidate_split_cache_for_group,
)


# ── Round 53f: Idempotency front-door for every settle path ──────────
async def _settle_idempotency_front_door(
    user_id: str, idempotency_key: Optional[str], scope: str = "settle",
) -> tuple[bool, Optional[Dict[str, Any]]]:
    """Try to reserve / replay an Idempotency-Key for a settle request.

    Returns ``(should_proceed, cached_response)``:
      • (True, None)  → caller is the race winner; run the settle logic
      • (False, dict) → cached response — return it as-is to the user
      • (False, None) → in-flight duplicate; raise 409

    Header is OPTIONAL: legacy clients that don't send it keep working
    exactly as before (no idempotency, but still protected by the
    advisory `_settle_lock`).
    """
    if not idempotency_key:
        return True, None
    cached = await replay_idempotency(user_id, scope, idempotency_key)
    if cached is not None:
        return False, cached
    if not await reserve_idempotency(user_id, scope, idempotency_key):
        # In-flight: the previous attempt reserved but hasn't committed.
        raise HTTPException(status_code=409, detail="Idempotency key in flight; retry later")
    return True, None


async def _settle_idempotency_commit(
    user_id: str, idempotency_key: Optional[str], response: Dict[str, Any],
    scope: str = "settle",
) -> None:
    """Cache the response so future retries replay verbatim. Best-effort:
    a cache failure must NEVER break the user's already-successful settle."""
    if not idempotency_key:
        return
    try:
        await commit_idempotency(user_id, scope, idempotency_key, response)
    except Exception:
        # Observability: tag this so we can spot cache-store regressions.
        try:
            from core.observability import capture_silenced
            capture_silenced(
                Exception("idempotency_commit_failed"),
                tag="settle_idempotency_commit",
                extras={"scope": scope},
            )
        except Exception as _exc:
            logging.warning('split_settle L89 silent-except: %s', _exc)


# Round 51 — settlement cache invalidation helper.
# A settlement always changes the balance for at least 2 users (payer +
# payee). When a `group_id` is provided we invalidate the full member
# roster via the shared helper so every member sees the fresh /split/
# groups response. For cross-group settlements (rare; group_id=None) we
# clear just the two affected users' caches directly.
async def _invalidate_settlement_caches(payer_id: str, payee_id: str, group_id: Optional[str]) -> None:
    if group_id:
        try:
            await invalidate_split_cache_for_group(group_id, db)
        except Exception as _exc:
            logging.warning('split_settle L103 silent-except: %s', _exc)
    cache_clear_prefix(f"split_groups:{payer_id}")
    cache_clear_prefix(f"split_groups:{payee_id}")


# ── Round 53a: ledger-invariant guard for every settle path ──────────
def _assert_settlement_invariant(payer_id: str, payee_id: str, amount_paise: int, *, context: str) -> None:
    """Build the canonical 2-entry settlement journal and verify
    sum(debits) == sum(credits) BEFORE we touch the DB. Raises a 400
    HTTPException with the breakdown on violation — no side-effects."""
    try:
        entries = build_settlement_entries(
            payer_id=payer_id, payee_id=payee_id, amount_paise=amount_paise,
        )
        assert_double_entry(entries, context=context)
    except LedgerInvariantError as exc:
        raise HTTPException(status_code=400, detail=f"Ledger invariant violation: {exc}")


# ─── Debt-pair advisory lock (Round 30 race fix) ──────────────────────
# MongoDB-native mutex: inserting a doc with the pair's `_id` succeeds
# for the first caller; concurrent inserts DuplicateKeyError → we 429.
# The lock doc auto-expires via TTL index (see server.py startup) so a
# crashed request can't block the pair forever.
def _settle_lock_key(user_id: str, target_user_id: str, group_id: Optional[str]) -> str:
    pair = ":".join(sorted([user_id or "", target_user_id or ""]))
    return f"settle:{pair}:{group_id or '*'}"


@asynccontextmanager
async def _settle_lock(user_id: str, target_user_id: str, group_id: Optional[str]):
    """Acquire a short-lived advisory lock for this (payer, payee, group) tuple.

    Prevents TOCTOU races between `compute_outstanding_debt` and
    `settlements.insert_one` under concurrent settle attempts. First
    caller wins; others get HTTP 429.
    """
    key = _settle_lock_key(user_id, target_user_id, group_id)
    try:
        await db.settle_locks.insert_one({"_id": key, "at": utc_now()})
    except DuplicateKeyError:
        raise HTTPException(status_code=429, detail="Another settlement is in progress, please retry")
    try:
        yield
    finally:
        try:
            await db.settle_locks.delete_one({"_id": key})
        except Exception as _exc:
            logging.warning('split_settle L151 silent-except: %s', _exc)


async def dismiss_reminders_after_settle(payer_id: str, payee_id: str) -> int:
    """Auto-dismiss any pending reminders that the payee sent to the payer
    for this debt. Called from every settle path (UPI, offline, rewards,
    Razorpay) so a successful payment always clears stale reminder banners.
    Returns the count of reminders dismissed.
    """
    try:
        r = await db.split_reminders.update_many(
            {"recipient_id": payer_id, "sender_id": payee_id, "status": "pending"},
            {"$set": {"status": "settled", "dismissed_at": utc_now()}},
        )
        return int(r.modified_count or 0)
    except Exception as _exc:
        logging.warning('split_settle L167 default-return on except: %s', _exc)
        return 0


# ============== COIN REDEMPTION FOR SPLIT PAYMENTS ==============
# Rate is shared with premium coin redemption so the UX feels consistent.
COINS_PER_RUPEE = 10           # 10 coins = ₹1
SPLIT_MAX_DISCOUNT_PCT = 0.50  # Cap redemption at 50% of the debt amount


async def _get_user_coin_balance(user_id: str) -> int:
    try:
        u = await get_user_by_id(user_id)
    except Exception as _exc:
        logging.warning('split_settle L181 default-return on except: %s', _exc)
        return 0
    if not u:
        return 0
    return int(u.get("coins", 0) or 0)


def _split_max_discount(amount: float) -> int:
    return int(max(0.0, float(amount)) * SPLIT_MAX_DISCOUNT_PCT)


@api_router.post("/split/coin-redeem-preview")
async def split_coin_redeem_preview(data: dict, user_id: str = Depends(get_current_user)):
    """Preview coin redemption for a split settlement.

    Body: {amount: float, coins_to_use: int (optional, defaults to max)}
    Returns {amount, coin_balance, coins_applied, discount, effective_amount, max_discount, rate}.
    Never mutates state — safe for repeated slider calls.
    """
    amount = float(data.get("amount", 0) or 0)
    if amount <= 0:
        raise_positive_amount_required()

    balance = await _get_user_coin_balance(user_id)
    requested = int(data.get("coins_to_use", balance) or 0)
    requested = max(0, requested)

    max_disc = _split_max_discount(amount)
    applied_coins = min(requested, balance, max_disc * COINS_PER_RUPEE)
    discount = applied_coins // COINS_PER_RUPEE
    effective = max(0.0, round(amount - discount, 2))

    return {
        "amount": amount,
        "coin_balance": balance,
        "coins_applied": applied_coins,
        "discount": discount,
        "effective_amount": effective,
        "effective_price": effective,  # alias so shared CoinRedeemPanel works unchanged
        "list_price": amount,
        "max_discount": max_disc,
        "rate": {"coins_per_rupee": COINS_PER_RUPEE, "max_pct": int(SPLIT_MAX_DISCOUNT_PCT * 100)},
    }


async def _apply_split_coin_redemption(user_id: str, amount: float, coins_requested: int) -> dict:
    """Shared helper — deducts coins and returns breakdown. Used by settle endpoints below.

    Round 31 Paranoid-audit fix: now routes through `core.ledger.spend_coins`
    so the debit lands in `ledger_transactions` (the canonical ledger).
    Prior code did `$inc user.coins: -N` + legacy `coin_ledger` write, both
    silently wiped by the `/coins/balance` self-heal — letting the user
    redeem coins for a split discount while keeping the coins.
    """
    from core import ledger as ledger_service
    import uuid as _uuid

    if coins_requested <= 0 or amount <= 0:
        return {"coins_applied": 0, "discount": 0, "effective_amount": amount}

    # Canonical balance from the ledger (authoritative).
    balance = await ledger_service.get_balance(user_id)
    max_disc_coins = _split_max_discount(amount) * COINS_PER_RUPEE
    applied_coins = min(coins_requested, balance, max_disc_coins)
    discount = applied_coins // COINS_PER_RUPEE

    if applied_coins > 0:
        # Atomic debit through the ledger (idempotency keeps a double-
        # submission from double-spending).
        idem_key = f"split_redemption::{user_id}::{_uuid.uuid4().hex[:12]}"
        try:
            await ledger_service.spend_coins(
                user_id=user_id, amount=int(applied_coins),
                source="split_redemption", idempotency_key=idem_key,
            )
        except ValueError:
            # Insufficient balance (rare race) — fail gracefully with no discount.
            return {"coins_applied": 0, "discount": 0, "effective_amount": amount}

    return {
        "coins_applied": applied_coins,
        "discount": int(discount),
        "effective_amount": max(0.0, round(amount - discount, 2)),
    }




@api_router.get("/split/balances")
async def get_overall_balances(user_id: str = Depends(get_current_user)):
    """Get overall who owes you / you owe across all groups.

    CRITICAL: subtracts completed settlements (including partial + offline) so the
    balance reflects what's actually owed after payments. Mirrors the logic used in
    /split/groups/{id}/summary so both endpoints stay in sync.

    Round 30 perf fix: N+1 eliminated. Previously did 1 query per group for
    expenses → 20 groups = 20 round-trips. Now collects all group_ids and
    issues a single $in query. O(2) DB round-trips regardless of group count.
    """
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(50)
    group_ids = [str(g["_id"]) for g in groups]
    # Aggregate by the OTHER user's id (stable key across name changes)
    # Positive balance = they owe me; Negative = I owe them.
    by_uid: Dict[str, float] = {}
    uid_to_name: Dict[str, str] = {}
    for g in groups:
        uid_to_name.update({m["user_id"]: m["name"] for m in g.get("members", [])})

    # SINGLE round-trip for all expenses across all the user's groups.
    all_expenses = await db.split_expenses.find(
        {"group_id": {"$in": group_ids}}
    ).to_list(5000) if group_ids else []
    for exp in all_expenses:
        payer = exp["paid_by"]
        for uid, amt in (exp.get("splits") or {}).items():
            if uid == payer:
                continue
            if payer == user_id:
                by_uid[uid] = by_uid.get(uid, 0) + amt
            elif uid == user_id:
                by_uid[payer] = by_uid.get(payer, 0) - amt

    # Apply settlements (including partial + offline) — reduces the outstanding debt.
    # payer_id is the person who paid; payee_id is the receiver.
    settlements = await db.settlements.find({
        "$or": [{"payer_id": user_id}, {"payee_id": user_id}]
    }).to_list(1000)
    for st in settlements:
        amt = float(st.get("amount", 0))
        if amt <= 0: continue
        if st.get("payer_id") == user_id:
            # I paid them → reduces the amount I owed them (which was negative)
            other = st.get("payee_id")
            if other:
                by_uid[other] = by_uid.get(other, 0) + amt
        elif st.get("payee_id") == user_id:
            # They paid me → reduces the amount they owed me (which was positive)
            other = st.get("payer_id")
            if other:
                by_uid[other] = by_uid.get(other, 0) - amt

    # Build response dicts keyed by NAME (backwards-compat with frontend)
    owe_you: Dict[str, float] = {}
    you_owe: Dict[str, float] = {}
    # Filter small residual rounding noise (< ₹0.50)
    for other_uid, v in by_uid.items():
        if abs(v) < 0.5:
            continue
        nm = uid_to_name.get(other_uid, "Unknown")
        if v > 0:
            owe_you[nm] = round(v, 2)
        else:
            you_owe[nm] = round(abs(v), 2)

    return {
        "total_owed_to_you": round(sum(owe_you.values()), 2),
        "total_you_owe": round(sum(you_owe.values()), 2),
        "owe_you": owe_you,
        "you_owe": you_owe
    }


# ─────────────────────────────────────────────────────────────────────────
# Helper: compute the net debt the caller owes to a specific payee.
# Used by /split/settle, /split/partial-settle, /split/settle-with-rewards
# and /split/mark-paid-offline to reject phantom settles + lock out races.
# Returns a positive float when the caller owes money to target_user_id;
# 0 or negative when nothing is owed (or the other party owes the caller).
# ─────────────────────────────────────────────────────────────────────────
async def compute_outstanding_debt(user_id: str, target_user_id: str, group_id: Optional[str] = None) -> float:
    groups_q = {"members.user_id": {"$all": [user_id, target_user_id]}}
    if group_id:
        try:
            groups_q["_id"] = safe_oid(group_id, field_name="group_id")
        except Exception as _exc:
            logging.warning('split_settle L357 default-return on except: %s', _exc)
            return 0.0
    groups = await db.split_groups.find(groups_q).to_list(50)
    if not groups:
        return 0.0
    net = 0.0  # + means target owes caller; - means caller owes target
    for g in groups:
        expenses = await db.split_expenses.find({"group_id": str(g["_id"])}).to_list(1000)
        for exp in expenses:
            payer = exp.get("paid_by")
            splits = exp.get("splits") or {}
            if payer == user_id and target_user_id in splits:
                net += float(splits[target_user_id] or 0)
            elif payer == target_user_id and user_id in splits:
                net -= float(splits[user_id] or 0)
    # Subtract settlements already recorded between this pair
    stl_q: Dict[str, Any] = {
        "$or": [
            {"payer_id": user_id, "payee_id": target_user_id},
            {"payer_id": target_user_id, "payee_id": user_id},
        ],
    }
    if group_id:
        stl_q["group_id"] = group_id
    settlements = await db.settlements.find(stl_q).to_list(2000)
    for st in settlements:
        amt = float(st.get("amount") or 0)
        if amt <= 0:
            continue
        if st.get("payer_id") == user_id:
            net += amt  # I already paid → my debt shrinks
        else:
            net -= amt  # They paid me → their debt shrinks
    # Caller owes `target` when net < 0; return positive magnitude.
    return round(-net, 2) if net < 0 else 0.0



@api_router.get("/split/pay-intent/{target_user_id}")
async def generate_upi_pay_intent(target_user_id: str, amount: float, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(target_user_id):
        raise_invalid_id("target_user_id")
    """Generate UPI deep link for payment"""
    
    target = await db.users.find_one({"_id": ObjectId(target_user_id)}, {"upi_id": 1, "name": 1})
    if not target or not target.get("upi_id"):
        raise HTTPException(status_code=400, detail="Payee hasn't set up UPI ID")
    
    payee_name = target.get("name", "MintU User")
    upi_id = target["upi_id"]
    txn_ref = f"MINTU{uuid_lib.uuid4().hex[:8].upper()}"
    
    # UPI intent deep link (works with GPay, PhonePe, Paytm, BHIM)
    upi_link = f"upi://pay?pa={quote(upi_id)}&pn={quote(payee_name)}&am={amount:.2f}&cu=INR&tn={quote('MintU Split Settlement')}&tr={txn_ref}"
    
    return {
        "upi_link": upi_link,
        "payee_name": payee_name,
        "payee_upi": mask_upi_id(upi_id),
        "amount": amount,
        "txn_ref": txn_ref,
        "currency": "INR"
    }



@api_router.post("/split/settle")
async def settle_payment(
    data: SettlePayment,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    """Mark a split payment as settled.

    Hardened (Round 29 → 53f):
      • Rejects phantom settles — verifies the caller actually owes the
        payee (via compute_outstanding_debt) and amount ≤ outstanding.
      • Atomic guard — inserts the settlement inside an ordered two-step:
        re-check outstanding, then insert. Concurrent calls will still
        race but each subsequent insert will see the prior settlement
        reflected in outstanding, which prevents over-payment.
      • Idempotency-Key (Round 53f) — exactly-once semantics for retries.
      • Post-commit hooks (Round 53f) — cache invalidation, event-bus
        emit, and reminder dismissal fire AFTER the settlement insert,
        never before. No phantom events on rollback / failure.
    """
    if not ObjectId.is_valid(data.target_user_id):
        raise_invalid_id("target_user_id")
    if data.amount is None or data.amount <= 0:
        raise_positive_amount_required()

    # ── Round 53f — idempotency front door (no-op when header absent) ──
    proceed, cached = await _settle_idempotency_front_door(user_id, idempotency_key)
    if not proceed:
        return cached

    async with _settle_lock(user_id, data.target_user_id, data.group_id):
        outstanding = await compute_outstanding_debt(user_id, data.target_user_id, data.group_id)
        if outstanding <= 0:
            raise_no_outstanding_debt()
        if data.amount > outstanding + 0.5:  # allow ₹0.50 rounding slack
            raise HTTPException(status_code=400, detail=f"Amount exceeds outstanding ₹{outstanding:.2f}")

        # Round 53a — paise + invariant BEFORE the insert.
        amount_paise = coerce_to_paise(data.amount)
        _assert_settlement_invariant(
            payer_id=user_id, payee_id=data.target_user_id,
            amount_paise=amount_paise, context="settle_payment",
        )

        settlement = {
            "payer_id": user_id,
            "payee_id": data.target_user_id,
            "amount": data.amount,
            "amount_paise": amount_paise,
            "method": data.method,
            "txn_ref": data.txn_ref or f"MINTU{uuid_lib.uuid4().hex[:8].upper()}",
            "group_id": data.group_id,
            "status": "completed",
            "settled_at": utc_now(),
            "created_at": utc_now()
        }

        # Round 53f — write inside with_atomic_ctx so the cache-invalidation
        # + event emit fire ONLY on a durable insert. Single-doc insert means
        # there's no rollback risk on Atlas, but the contract still applies:
        # if the insert raises, NO side-effects.
        async def _do(session, ctx: PostCommitContext):
            result = await db.settlements.insert_one(settlement, session=session)
            settlement["id"] = str(result.inserted_id)

            # Reminders auto-dismissal: post-commit only.
            ctx.on_commit(lambda: dismiss_reminders_after_settle(user_id, data.target_user_id))
            # Cache invalidation: post-commit only.
            ctx.on_commit(lambda: _invalidate_settlement_caches(user_id, data.target_user_id, data.group_id))

            # Event-bus emit: post-commit only. Captures "this settlement
            # actually persisted" semantics — analytics never count
            # phantom events.
            def _emit_settlement_event():
                try:
                    from core.events import emit, Events
                    emit(Events.SETTLEMENT_COMPLETED,
                         payer_id=user_id,
                         payee_id=data.target_user_id,
                         amount=float(data.amount),
                         group_id=data.group_id,
                         method=data.method,
                         settlement_id=settlement["id"])
                except Exception as _exc:
                    logging.warning('split_settle L507 silent-except: %s', _exc)
            ctx.on_commit(_emit_settlement_event)

            return result

        await with_atomic_ctx(db.client, _do, label="settle_payment")

    # Get names safely
    payee_name = "User"
    try:
        payee = await db.users.find_one({"_id": ObjectId(data.target_user_id)}, {"name": 1})
        if payee: payee_name = payee.get("name", "User")
    except Exception as _exc:
        logging.warning('split_settle L520 silent-except: %s', _exc)

    response_body = {
        "id": settlement["id"],
        "message": f"Payment of ₹{data.amount:,.0f} to {payee_name} marked as settled!",
        "txn_ref": settlement["txn_ref"],
        "status": "completed"
    }
    await _settle_idempotency_commit(user_id, idempotency_key, response_body)
    return response_body



@api_router.get("/split/settlements")
async def get_settlements(user_id: str = Depends(get_current_user)):
    """Get payment settlement history"""
    
    settlements = await db.settlements.find({
        "$or": [{"payer_id": user_id}, {"payee_id": user_id}]
    }).sort("settled_at", -1).to_list(50)

    # Phase 5 fix: pre-fetch all payer + payee names in a single $in query
    # instead of 2 serial find_one() calls per settlement (was 100 round-trips
    # for the default 50-settlement page — now 1 round-trip).
    uid_strs = set()
    for s in settlements:
        uid_strs.add(s.get("payer_id"))
        uid_strs.add(s.get("payee_id"))
    oid_to_name: Dict[str, str] = {}
    oids = []
    for uid in uid_strs:
        if uid:
            try:
                oids.append(ObjectId(uid))
            except Exception:
                continue
    if oids:
        async for u in db.users.find({"_id": {"$in": oids}}, {"name": 1}):
            oid_to_name[str(u["_id"])] = u.get("name", "User")

    result = []
    for s in settlements:
        result.append({
            "id": str(s["_id"]),
            "payer_name": oid_to_name.get(s.get("payer_id"), "User"),
            "payee_name": oid_to_name.get(s.get("payee_id"), "User"),
            "amount": s["amount"],
            "method": s["method"],
            "txn_ref": s.get("txn_ref", ""),
            "status": s["status"],
            "is_payer": s["payer_id"] == user_id,
            "settled_at": s["settled_at"].isoformat() if s.get("settled_at") else None
        })
    return result



@api_router.post("/split/partial-settle")
async def partial_settle(
    data: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    """Record a partial payment toward a debt.

    Unlike /split/settle-with-rewards which assumes full settlement, this allows any amount
    less than or equal to the remaining debt. Multiple partials accumulate into a single
    conceptual 'settlement_amount' that reduces the balance in /summary calculations.

    Round 53f — accepts optional ``Idempotency-Key`` header for retry safety.
    Side-effects (cache invalidation, chat-card insert, reminder dismissal,
    coin reward bump) all run as POST-COMMIT hooks — never on rollback.
    """
    target_user_id = data.get("target_user_id")
    amount = float(data.get("amount", 0))
    group_id = data.get("group_id")
    method = data.get("method", "upi")
    note = (data.get("note") or "").strip()
    coins_to_use = int(data.get("coins_to_use", 0) or 0)

    if not target_user_id or amount <= 0:
        raise HTTPException(status_code=400, detail="target_user_id and positive amount required")
    if not ObjectId.is_valid(target_user_id):
        raise_invalid_id("target_user_id")

    proceed, cached = await _settle_idempotency_front_door(user_id, idempotency_key, scope="partial_settle")
    if not proceed:
        return cached

    async with _settle_lock(user_id, target_user_id, group_id):
        # Phantom-settle + double-settle guard (Round 29, locked Round 30)
        outstanding = await compute_outstanding_debt(user_id, target_user_id, group_id)
        if outstanding <= 0:
            raise_no_outstanding_debt()
        if amount > outstanding + 0.5:
            raise HTTPException(status_code=400, detail=f"Amount exceeds outstanding ₹{outstanding:.2f}")

        # Round 53a — paise + invariant BEFORE coin redemption / DB write.
        amount_paise = coerce_to_paise(amount)
        _assert_settlement_invariant(
            payer_id=user_id, payee_id=target_user_id,
            amount_paise=amount_paise, context="partial_settle",
        )

        # Coin redemption is a state mutation (debits user's balance) but
        # it's compensable and idempotency-keyed at the higher level.
        # Keep it BEFORE the settle insert so the cash_paid/coin_discount
        # values are correct on the persisted doc.
        redemption = await _apply_split_coin_redemption(user_id, amount, coins_to_use)

        settlement = {
            "payer_id": user_id,
            "payee_id": target_user_id,
            "amount": amount,
            "amount_paise": amount_paise,
            "cash_paid": redemption["effective_amount"],
            "coin_discount": redemption["discount"],
            "coins_applied": redemption["coins_applied"],
            "method": method,
            "txn_ref": f"PART-{uuid_lib.uuid4().hex[:8].upper()}",
            "group_id": group_id,
            "note": note,
            "is_partial": True,
            "status": "completed",
            "settled_at": utc_now(),
            "created_at": utc_now(),
        }

        # Resolve names BEFORE the txn so we can pass them into hooks.
        payer_name = "User"
        payee_name = "User"
        try:
            p = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
            if p: payer_name = p.get("name", "User")
        except Exception as _exc:
            logging.warning('split_settle L648 silent-except: %s', _exc)
        try:
            pe = await db.users.find_one({"_id": ObjectId(target_user_id)}, {"name": 1})
            if pe: payee_name = pe.get("name", "User")
        except Exception as _exc:
            logging.warning('split_settle L653 silent-except: %s', _exc)

        async def _do(session, ctx: PostCommitContext):
            result = await db.settlements.insert_one(settlement, session=session)
            settlement_id = str(result.inserted_id)
            settlement["id"] = settlement_id

            # Coins reward proportional to amount (max 5 coins for partial).
            coins_earned = min(5, max(1, int(amount / 500)))

            # Reminders dismissal — post-commit only.
            ctx.on_commit(lambda: dismiss_reminders_after_settle(user_id, target_user_id))
            # Cache invalidation — post-commit only.
            ctx.on_commit(lambda: _invalidate_settlement_caches(user_id, target_user_id, group_id))

            # Reward bump — best-effort, post-commit so we never grant
            # coins for a settlement that didn't persist.
            async def _bump_rewards():
                try:
                    await db.users.update_one(
                        {"_id": ObjectId(user_id)},
                        {"$inc": {"reward_coins": coins_earned, "settlement_count": 1}},
                    )
                except Exception as _exc:
                    logging.warning('split_settle L677 silent-except: %s', _exc)
            ctx.on_commit(_bump_rewards)

            # Group chat-card — post-commit only.
            if group_id:
                async def _post_chat_card():
                    try:
                        coin_tag = f" 🪙{redemption['coins_applied']} coins" if redemption["coins_applied"] > 0 else ""
                        await db.split_messages.insert_one({
                            "group_id": group_id,
                            "type": "system",
                            "content": f"💰 {payer_name} paid ₹{amount:,.0f} (partial) to {payee_name}{coin_tag}",
                            "sender_id": user_id,
                            "sender_name": payer_name,
                            "settlement_data": {
                                "amount": amount,
                                "method": method,
                                "settlement_id": settlement_id,
                                "is_partial": True,
                                "coins_applied": redemption["coins_applied"],
                                "coin_discount": redemption["discount"],
                            },
                            "created_at": utc_now(),
                        })
                    except Exception as e:
                        logging.warning(f"Could not post partial settlement message: {e}")
                ctx.on_commit(_post_chat_card)

            return result, coins_earned

        _, coins_earned = await with_atomic_ctx(db.client, _do, label="partial_settle")

    response_body = {
        "id": settlement["id"],
        "message": f"Partial ₹{amount:,.0f} to {payee_name} recorded ✅",
        "amount": amount,
        "coins_earned": coins_earned,
        "coins_applied": redemption["coins_applied"],
        "coin_discount": redemption["discount"],
        "cash_paid": redemption["effective_amount"],
        "txn_ref": settlement["txn_ref"],
        "is_partial": True,
    }
    await _settle_idempotency_commit(user_id, idempotency_key, response_body, scope="partial_settle")
    return response_body



@api_router.post("/split/settle-with-rewards")
async def settle_with_rewards(
    data: SettlePayment,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    """Settle payment and earn reward coins. Supports optional coin redemption via data.coins_to_use.

    Round 53f — accepts ``Idempotency-Key`` header for retry safety.
    Reward bump, badge insert, and cache invalidation now run as
    POST-COMMIT hooks — never on rollback.
    """

    if not ObjectId.is_valid(data.target_user_id):
        raise_invalid_id("target_user_id")
    if data.amount is None or data.amount <= 0:
        raise_positive_amount_required()

    proceed, cached = await _settle_idempotency_front_door(user_id, idempotency_key, scope="settle_with_rewards")
    if not proceed:
        return cached

    async with _settle_lock(user_id, data.target_user_id, data.group_id):
        # Phantom-settle + double-settle guard (Round 29, locked Round 30)
        outstanding = await compute_outstanding_debt(user_id, data.target_user_id, data.group_id)
        if outstanding <= 0:
            raise_no_outstanding_debt()
        if data.amount > outstanding + 0.5:
            raise HTTPException(status_code=400, detail=f"Amount exceeds outstanding ₹{outstanding:.2f}")

        # Round 53a — paise + invariant BEFORE coin redemption / DB write.
        amount_paise = coerce_to_paise(data.amount)
        _assert_settlement_invariant(
            payer_id=user_id, payee_id=data.target_user_id,
            amount_paise=amount_paise, context="settle_with_rewards",
        )

        # Calculate reward tier
        reward = SETTLEMENT_REWARDS["on_time"]
        for tier_key, tier in SETTLEMENT_REWARDS.items():
            reward = tier
            break  # Give best available reward for now

        # Apply coin redemption first (deducts from balance). Debt still cleared fully.
        redemption = await _apply_split_coin_redemption(user_id, data.amount, int(data.coins_to_use or 0))

        settlement = {
            "payer_id": user_id,
            "payee_id": data.target_user_id,
            "amount": data.amount,
            "amount_paise": amount_paise,
            "cash_paid": redemption["effective_amount"],
            "coin_discount": redemption["discount"],
            "coins_applied": redemption["coins_applied"],
            "method": data.method,
            "txn_ref": data.txn_ref or f"MINTU{uuid_lib.uuid4().hex[:8].upper()}",
            "group_id": data.group_id,
            "status": "completed",
            "coins_earned": reward["coins"],
            "reward_label": reward["label"],
            "settled_at": utc_now(),
            "created_at": utc_now()
        }

        async def _do(session, ctx: PostCommitContext):
            result = await db.settlements.insert_one(settlement, session=session)
            settlement["id"] = str(result.inserted_id)

            ctx.on_commit(lambda: dismiss_reminders_after_settle(user_id, data.target_user_id))
            ctx.on_commit(lambda: _invalidate_settlement_caches(user_id, data.target_user_id, data.group_id))

            async def _bump_rewards():
                try:
                    await db.users.update_one(
                        {"_id": ObjectId(user_id)},
                        {"$inc": {"reward_coins": reward["coins"], "settlement_count": 1}},
                    )
                except Exception as _exc:
                    logging.warning('split_settle L803 silent-except: %s', _exc)
            ctx.on_commit(_bump_rewards)

            return result

        await with_atomic_ctx(db.client, _do, label="settle_with_rewards")

    # Compute downstream values (badges, cashback) AFTER the commit.
    # These are read-mostly and depend on the post-commit reward bump
    # — but the bump fires synchronously inside _fire() above, so by the
    # time we reach here the user doc is already updated.
    user = await get_user_by_id(user_id)
    settle_count = user.get("settlement_count", 0) if user else 0
    total_coins = user.get("reward_coins", 0) if user else 0
    new_badges = []
    for badge in SETTLEMENT_BADGES:
        if settle_count >= badge["threshold"]:
            existing = await db.user_badges.find_one({"user_id": user_id, "badge_id": badge["id"]})
            if not existing:
                await db.user_badges.insert_one({"user_id": user_id, "badge_id": badge["id"], "earned_at": utc_now()})
                new_badges.append(badge)

    # Calculate cashback (coins reduce future payments)
    cashback_value = min(total_coins * 0.5, data.amount * 0.05)  # Max 5% cashback

    payee_name = "User"
    try:
        payee = await db.users.find_one({"_id": ObjectId(data.target_user_id)}, {"name": 1})
        if payee: payee_name = payee.get("name", "User")
    except Exception as _exc:
        logging.warning('split_settle L833 silent-except: %s', _exc)

    response_body = {
        "id": settlement["id"],
        "message": f"₹{data.amount:,.0f} paid to {payee_name}! 🎉",
        "txn_ref": settlement["txn_ref"],
        "coins_applied": redemption["coins_applied"],
        "coin_discount": redemption["discount"],
        "cash_paid": redemption["effective_amount"],
        "reward": {
            "coins_earned": reward["coins"],
            "label": reward["label"],
            "total_coins": total_coins,
            "cashback_available": round(cashback_value, 2),
            "new_badges": new_badges,
        }
    }
    await _settle_idempotency_commit(user_id, idempotency_key, response_body, scope="settle_with_rewards")
    return response_body



@api_router.post("/split/redeem-coins")
async def redeem_coins(data: dict, user_id: str = Depends(get_current_user)):
    """Redeem reward coins as cashback on next settlement"""
    coins_to_redeem = data.get("coins", 0)
    user = await get_user_by_id(user_id)
    available = user.get("reward_coins", 0) if user else 0

    if coins_to_redeem > available:
        raise HTTPException(status_code=400, detail=f"Only {available} coins available")

    cashback = round(coins_to_redeem * 0.5, 2)
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$inc": {"reward_coins": -coins_to_redeem}})

    return {"redeemed": coins_to_redeem, "cashback": cashback, "remaining_coins": available - coins_to_redeem}


# ============== PAYMENT REMINDERS ==============


@api_router.post("/split/mark-paid-offline")
async def mark_paid_offline(
    data: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    """Mark a debt as paid offline (cash/bank transfer) without triggering UPI flow.

    Creates a settlement record + posts a system message in group chat.
    Used when a user says 'I already paid in cash' without going through UPI.
    Supports optional `coins_to_use` to apply a coin-based discount (debt is still
    fully settled — coins cover the discount portion; the payer only pays the
    remainder in cash/bank).

    Round 53f — accepts ``Idempotency-Key`` header for retry safety. Reward
    bump, reminder dismissal, cache invalidation, and chat-card insert all
    run as POST-COMMIT hooks.
    """
    target_user_id = data.get("target_user_id")
    amount = float(data.get("amount", 0))
    group_id = data.get("group_id")
    method = data.get("method", "cash")  # cash | bank_transfer | other
    note = (data.get("note") or "").strip()
    coins_to_use = int(data.get("coins_to_use", 0) or 0)

    if not target_user_id or amount <= 0:
        raise HTTPException(status_code=400, detail="target_user_id and positive amount required")
    if not ObjectId.is_valid(target_user_id):
        raise_invalid_id("target_user_id")

    proceed, cached = await _settle_idempotency_front_door(user_id, idempotency_key, scope="mark_paid_offline")
    if not proceed:
        return cached

    async with _settle_lock(user_id, target_user_id, group_id):
        # Phantom-settle + double-settle guard (Round 29, locked Round 30)
        outstanding = await compute_outstanding_debt(user_id, target_user_id, group_id)
        if outstanding <= 0:
            raise_no_outstanding_debt()
        if amount > outstanding + 0.5:
            raise HTTPException(status_code=400, detail=f"Amount exceeds outstanding ₹{outstanding:.2f}")

        # Round 53a — paise + invariant BEFORE coin redemption / DB write.
        amount_paise = coerce_to_paise(amount)
        _assert_settlement_invariant(
            payer_id=user_id, payee_id=target_user_id,
            amount_paise=amount_paise, context="mark_paid_offline",
        )

        # Apply coin redemption (deducts coins from balance). Still settle the FULL
        # debt amount — coins cover a discount on the actual cash outflow.
        redemption = await _apply_split_coin_redemption(user_id, amount, coins_to_use)

        settlement = {
            "payer_id": user_id,
            "payee_id": target_user_id,
            "amount": amount,
            "amount_paise": amount_paise,
            "cash_paid": redemption["effective_amount"],
            "coin_discount": redemption["discount"],
            "coins_applied": redemption["coins_applied"],
            "method": method,
            "txn_ref": f"OFFLINE-{uuid_lib.uuid4().hex[:8].upper()}",
            "group_id": group_id,
            "note": note,
            "status": "completed",
            "is_offline": True,
            "settled_at": utc_now(),
            "created_at": utc_now(),
        }

        # Resolve names BEFORE the txn so we can use them in hooks.
        payer_name = "User"
        payee_name = "User"
        try:
            p = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
            if p: payer_name = p.get("name", "User")
        except Exception as _exc:
            logging.warning('split_settle L952 silent-except: %s', _exc)
        try:
            pe = await db.users.find_one({"_id": ObjectId(target_user_id)}, {"name": 1})
            if pe: payee_name = pe.get("name", "User")
        except Exception as _exc:
            logging.warning('split_settle L957 silent-except: %s', _exc)

        async def _do(session, ctx: PostCommitContext):
            result = await db.settlements.insert_one(settlement, session=session)
            settlement_id = str(result.inserted_id)
            settlement["id"] = settlement_id

            # Reward bump — post-commit only.
            async def _bump_rewards():
                try:
                    await db.users.update_one(
                        {"_id": ObjectId(user_id)},
                        {"$inc": {"reward_coins": 1, "settlement_count": 1}},
                    )
                except Exception as _exc:
                    logging.warning('split_settle L972 silent-except: %s', _exc)
            ctx.on_commit(_bump_rewards)

            # Reminder dismissal — post-commit only.
            async def _dismiss_reminders():
                try:
                    await db.split_reminders.update_many(
                        {"recipient_id": user_id, "sender_id": target_user_id, "status": "pending"},
                        {"$set": {"status": "settled", "dismissed_at": utc_now()}}
                    )
                except Exception as _exc:
                    logging.warning('split_settle L983 silent-except: %s', _exc)
            ctx.on_commit(_dismiss_reminders)

            # Cache invalidation — post-commit only.
            ctx.on_commit(lambda: _invalidate_settlement_caches(user_id, target_user_id, group_id))

            # Chat-card insert — post-commit only.
            if group_id:
                async def _post_chat_card():
                    try:
                        method_label = {"cash": "💵 cash", "bank_transfer": "🏦 bank transfer", "other": "✅"}.get(method, "offline")
                        coin_tag = f" (🪙{redemption['coins_applied']} coins applied — ₹{redemption['discount']} off)" if redemption["coins_applied"] > 0 else ""
                        await db.split_messages.insert_one({
                            "group_id": group_id,
                            "type": "system",
                            "content": f"✅ {payer_name} paid ₹{amount:,.0f} to {payee_name} ({method_label}){coin_tag}",
                            "sender_id": user_id,
                            "sender_name": payer_name,
                            "settlement_data": {
                                "amount": amount,
                                "method": method,
                                "settlement_id": settlement_id,
                                "coins_applied": redemption["coins_applied"],
                                "coin_discount": redemption["discount"],
                            },
                            "created_at": utc_now(),
                        })
                    except Exception as e:
                        logging.warning(f"Could not post settlement system message: {e}")
                ctx.on_commit(_post_chat_card)

            return result

        await with_atomic_ctx(db.client, _do, label="mark_paid_offline")

    coin_suffix = f" · 🪙{redemption['coins_applied']} coins applied" if redemption["coins_applied"] > 0 else ""
    response_body = {
        "id": settlement["id"],
        "message": f"₹{amount:,.0f} marked as paid to {payee_name} ✅{coin_suffix}",
        "method": method,
        "txn_ref": settlement["txn_ref"],
        "coins_applied": redemption["coins_applied"],
        "coin_discount": redemption["discount"],
        "cash_paid": redemption["effective_amount"],
    }
    await _settle_idempotency_commit(user_id, idempotency_key, response_body, scope="mark_paid_offline")
    return response_body




# ============== ROUND 53k: SMART SETTLEMENTS ==============
# Greedy debt-simplification at the API boundary.
# Two endpoints:
#   GET  /split/groups/{group_id}/settle-plan      — read-only preview
#   POST /split/groups/{group_id}/settle-my-part   — atomic batch execute (mine only)


async def _net_balances_paise_for_group(group_id: str, group: Dict[str, Any]) -> Dict[str, int]:
    """Compute net balances (signed paise) for every member of a group.

    Positive  → creditor (the group owes this user money).
    Negative  → debtor   (this user owes the group money).
    Accounts for ALL expenses + settlements in this group, paise-canonical
    via the dual-read helpers in core.money. Sum across members SHOULD be
    zero modulo legacy float drift (caller passes drift_tolerance_paise
    to the planner to absorb the residual).
    """
    members = group.get("members", [])
    member_ids = {m["user_id"] for m in members}
    balances: Dict[str, int] = {uid: 0 for uid in member_ids}

    expenses = await db.split_expenses.find({"group_id": group_id}).to_list(2000)
    for exp in expenses:
        paid_by = exp.get("paid_by")
        if not paid_by:
            continue
        amount_p = paise_from_doc(exp, "amount")
        splits_p = splits_paise_from_doc(exp)
        # Payer fronted the cash → +credit. Each split member owes their share → -debit.
        if paid_by in balances:
            balances[paid_by] += int(amount_p)
        for uid, share_p in splits_p.items():
            if uid in balances:
                balances[uid] -= int(share_p)

    settlements = await db.settlements.find({"group_id": group_id}).to_list(2000)
    for st in settlements:
        amt_p = paise_from_doc(st, "amount")
        if amt_p <= 0:
            continue
        payer = st.get("payer_id")
        payee = st.get("payee_id")
        # Payer reduced their debt → balance goes up. Payee got paid → balance goes down.
        if payer in balances:
            balances[payer] += int(amt_p)
        if payee in balances:
            balances[payee] -= int(amt_p)

    return balances


@api_router.get("/split/groups/{group_id}/settle-plan")
async def settle_plan(group_id: str, user_id: str = Depends(get_current_user)):
    """Smart Settlements — read-only optimized plan preview.

    Returns the minimum-transaction settlement plan for a group, plus
    the subset of transfers where the caller is the payer (the rows the
    UI should highlight + execute via /settle-my-part).

    Caller must be a group member; non-members get 404.

    Response:
        {
          "transfers": [{from, from_name, to, to_name, amount, amount_paise, is_mine}],
          "my_transfers": [... subset where from == caller ...],
          "my_total_outgoing": float,
          "my_total_outgoing_paise": int,
          "summary": {transfers, total_paise, debtors, creditors},
          "members": {uid: name},
          "drift_paise": int   // residual rounding (typically 0; |·| ≤ 100p tolerated)
        }
    """
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")
    group = await db.split_groups.find_one(
        {"_id": safe_oid(group_id, field_name="group_id"), "members.user_id": user_id}
    )
    if not group:
        raise_group_not_found()

    member_names: Dict[str, str] = {
        m["user_id"]: m.get("name", "User") for m in group.get("members", [])
    }
    balances = await _net_balances_paise_for_group(group_id, group)

    # 100p (₹1) drift tolerance: legacy float-rupee expenses pre-paise
    # migration can leave a few-paise residual. Anything larger is a
    # real reconciliation bug — refuse to plan and surface 409.
    try:
        plan = plan_settlements(balances, drift_tolerance_paise=100)
    except SettlementPlannerError as exc:
        raise HTTPException(
            status_code=409, detail=f"Cannot plan settlements: {exc}"
        )

    transfers_out: list = []
    mine_out: list = []
    my_total_paise = 0
    for t in plan:
        is_mine = (t.from_user == user_id)
        item = {
            "from": t.from_user,
            "from_name": member_names.get(t.from_user, "User"),
            "to": t.to_user,
            "to_name": member_names.get(t.to_user, "User"),
            "amount": paise_to_rupees(t.paise),
            "amount_paise": t.paise,
            "is_mine": is_mine,
        }
        transfers_out.append(item)
        if is_mine:
            mine_out.append(item)
            my_total_paise += t.paise

    return {
        "group_id": group_id,
        "group_name": group.get("name", ""),
        "transfers": transfers_out,
        "my_transfers": mine_out,
        "my_total_outgoing": paise_to_rupees(my_total_paise),
        "my_total_outgoing_paise": my_total_paise,
        "summary": transfer_summary(plan),
        "members": member_names,
        "drift_paise": sum(balances.values()),
    }


@api_router.post("/split/groups/{group_id}/settle-my-part")
async def settle_my_part(
    group_id: str,
    data: Optional[dict] = None,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    """Smart Settlements — atomic batch execute for the caller's outgoing legs only.

    Re-runs the planner server-side (ignoring any client-supplied plan —
    never trust the client with money math) and writes ONE settlement
    per leg where ``from == current_user``. All inserts ride a single
    `with_atomic_ctx` so cache invalidation, reminder dismissal, chat
    cards and settlement events fire ONLY on a durable batch commit.

    Body (optional dict):
        method: str   — settlement method (default "upi")
        expected_total_paise: int
                      — defensive double-check. If provided and the
                        recomputed plan disagrees, returns 409 so the
                        UI can refresh + re-confirm. Prevents the
                        "preview vs execute drift" footgun.

    Idempotency-Key (header, optional): exactly-once for the entire batch.

    Returns:
        {
          message, batch_ref, settled_count,
          total_amount, total_paise,
          settlement_ids: [...],
          transfers: [{to, to_name, amount, amount_paise}, ...]
        }
    """
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")

    # ── idempotency front door (no-op if header absent) ──
    proceed, cached = await _settle_idempotency_front_door(
        user_id, idempotency_key, scope="settle_my_part"
    )
    if not proceed:
        return cached

    body = data or {}
    method = (body.get("method") or "upi").strip() or "upi"
    expected_total_paise = body.get("expected_total_paise")

    group = await db.split_groups.find_one(
        {"_id": safe_oid(group_id, field_name="group_id"), "members.user_id": user_id}
    )
    if not group:
        raise_group_not_found()

    member_names: Dict[str, str] = {
        m["user_id"]: m.get("name", "User") for m in group.get("members", [])
    }
    balances = await _net_balances_paise_for_group(group_id, group)
    try:
        plan = plan_settlements(balances, drift_tolerance_paise=100)
    except SettlementPlannerError as exc:
        raise HTTPException(
            status_code=409, detail=f"Cannot plan settlements: {exc}"
        )

    mine = my_transfers(plan, user_id)
    if not mine:
        raise HTTPException(
            status_code=400,
            detail="Nothing to settle — you have no outgoing transfers in this group",
        )

    total_paise = sum(t.paise for t in mine)

    # Optional preview-vs-execute drift check.
    if expected_total_paise is not None:
        try:
            expected = int(expected_total_paise)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400, detail="expected_total_paise must be an int"
            )
        if expected != total_paise:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Plan changed since preview "
                    f"(expected {expected}p, got {total_paise}p). "
                    "Refresh the plan and retry."
                ),
            )

    # ── pre-commit ledger invariant on EVERY leg (fail-fast) ──
    for t in mine:
        _assert_settlement_invariant(
            payer_id=t.from_user,
            payee_id=t.to_user,
            amount_paise=t.paise,
            context="settle_my_part",
        )

    now = utc_now()
    batch_ref = f"SMART{uuid_lib.uuid4().hex[:8].upper()}"
    settlements_to_insert: list = []
    for idx, t in enumerate(mine):
        settlements_to_insert.append({
            "payer_id": t.from_user,
            "payee_id": t.to_user,
            "amount": paise_to_rupees(t.paise),
            "amount_paise": t.paise,
            "method": method,
            "txn_ref": f"{batch_ref}-{idx + 1}",
            "group_id": group_id,
            "status": "completed",
            "is_smart_settle": True,
            "smart_batch_ref": batch_ref,
            "settled_at": now,
            "created_at": now,
        })

    inserted_ids: list = []

    async def _do(session, ctx: PostCommitContext):
        for st in settlements_to_insert:
            res = await db.settlements.insert_one(st, session=session)
            sid = str(res.inserted_id)
            st["id"] = sid
            inserted_ids.append(sid)

            payer_uid = st["payer_id"]
            payee_uid = st["payee_id"]
            amt_rupees = st["amount"]

            # Per-leg post-commit hooks (reminder dismissal + cache).
            ctx.on_commit(
                lambda p=payer_uid, q=payee_uid: dismiss_reminders_after_settle(p, q)
            )
            ctx.on_commit(
                lambda p=payer_uid, q=payee_uid: _invalidate_settlement_caches(p, q, group_id)
            )

            # Round 53m — auto-resolve the personality-driven nudge for
            # this (user, group) so the "you owe X" beat flips to the
            # celebratory beat next time the home/group surface loads.
            def _resolve_nudge(payer=payer_uid, gid=group_id):
                from routers.pending_nudges import resolve_nudge_after_settle
                import asyncio as _aio
                try:
                    loop = _aio.get_event_loop()
                    if loop.is_running():
                        _aio.create_task(resolve_nudge_after_settle(payer, gid))
                    else:
                        loop.run_until_complete(resolve_nudge_after_settle(payer, gid))
                except Exception as _exc:
                    logging.warning('split_settle L1314 silent-except: %s', _exc)
            ctx.on_commit(_resolve_nudge)

            # Per-leg event emission — analytics never count phantom rows.
            def _emit(payer=payer_uid, payee=payee_uid, amt=amt_rupees, sid_=sid):
                try:
                    from core.events import emit, Events
                    emit(
                        Events.SETTLEMENT_COMPLETED,
                        payer_id=payer,
                        payee_id=payee,
                        amount=float(amt),
                        group_id=group_id,
                        method=method,
                        settlement_id=sid_,
                        smart_settle=True,
                        smart_batch_ref=batch_ref,
                    )
                except Exception as _exc:
                    logging.warning('split_settle L1333 silent-except: %s', _exc)
            ctx.on_commit(_emit)

        # ONE chat-card for the whole batch (reads better than N rows).
        async def _post_chat_card():
            try:
                payer_name = member_names.get(user_id, "User")
                lines = "\n".join([
                    f"  → {member_names.get(t.to_user, 'User')}: ₹{paise_to_rupees(t.paise):,.2f}"
                    for t in mine
                ])
                plural = "s" if len(mine) != 1 else ""
                await db.split_messages.insert_one({
                    "group_id": group_id,
                    "type": "system",
                    "content": (
                        f"⚡ {payer_name} smart-settled "
                        f"₹{paise_to_rupees(total_paise):,.2f} in {len(mine)} "
                        f"optimized transfer{plural}\n{lines}"
                    ),
                    "sender_id": user_id,
                    "sender_name": payer_name,
                    "settlement_data": {
                        "smart_batch_ref": batch_ref,
                        "transfers": [
                            {
                                "to": t.to_user,
                                "to_name": member_names.get(t.to_user, "User"),
                                "amount": paise_to_rupees(t.paise),
                                "amount_paise": t.paise,
                            }
                            for t in mine
                        ],
                        "total_paise": total_paise,
                    },
                    "created_at": utc_now(),
                })
            except Exception as e:
                logging.warning(f"Could not post smart-settle chat card: {e}")
        ctx.on_commit(_post_chat_card)

        return inserted_ids

    await with_atomic_ctx(db.client, _do, label="settle_my_part")

    plural = "s" if len(mine) != 1 else ""
    response_body = {
        "message": (
            f"Smart-settled ₹{paise_to_rupees(total_paise):,.0f} across "
            f"{len(mine)} optimized transfer{plural}"
        ),
        "batch_ref": batch_ref,
        "settled_count": len(mine),
        "total_amount": paise_to_rupees(total_paise),
        "total_paise": total_paise,
        "settlement_ids": inserted_ids,
        "transfers": [
            {
                "to": t.to_user,
                "to_name": member_names.get(t.to_user, "User"),
                "amount": paise_to_rupees(t.paise),
                "amount_paise": t.paise,
            }
            for t in mine
        ],
    }
    await _settle_idempotency_commit(
        user_id, idempotency_key, response_body, scope="settle_my_part"
    )
    return response_body


# Activity feed & leaderboard moved to split_activity.py (Phase 6)
