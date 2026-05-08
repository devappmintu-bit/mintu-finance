"""Power-user data export — R109.

Generates CSV / JSON snapshots of the user's MintU data for:
  • personal record-keeping
  • CA / accountant handoff
  • migration to other apps

Endpoints:
  GET  /api/export/transactions.csv?from=YYYY-MM-DD&to=YYYY-MM-DD
  GET  /api/export/budgets.csv
  GET  /api/export/all.json     — full bundle (transactions, budgets, goals)

Auth required. Streams the file inline so large windows don't OOM.
"""
import csv
import io
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from core import db, get_current_user

router = APIRouter(prefix="/export", tags=["export"])


def _parse_date(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Accept YYYY-MM-DD or full ISO
        if "T" in s:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        else:
            d = datetime.strptime(s, "%Y-%m-%d")
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        raise HTTPException(400, f"Invalid date: {s!r}. Use YYYY-MM-DD.")


def _safe_str(v) -> str:
    """Coerce any DB value to a CSV-safe string."""
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


@router.get("/transactions.csv")
async def export_transactions_csv(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user),
):
    """Stream user's transactions as CSV.

    Window defaults to "everything". Sorted by date descending.
    Columns: date, type, amount, category, merchant, description,
             confidence, source, last4, pending_review, raw_hash.
    """
    q: dict = {"user_id": user_id}
    date_q: dict = {}
    if from_:
        date_q["$gte"] = _parse_date(from_)
    if to:
        date_q["$lte"] = _parse_date(to)
    if date_q:
        q["date"] = date_q

    cursor = db.transactions.find(q).sort("date", -1)

    async def gen():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow([
            "date", "type", "amount", "category", "merchant",
            "description", "confidence", "source", "last4",
            "pending_review", "raw_hash",
        ])
        # Yield header right away so the client streams the first row.
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)

        async for t in cursor:
            w.writerow([
                _safe_str(t.get("date")),
                _safe_str(t.get("type")),
                _safe_str(t.get("amount")),
                _safe_str(t.get("category")),
                _safe_str(t.get("merchant")),
                _safe_str(t.get("description")),
                _safe_str(t.get("confidence")),
                _safe_str(t.get("source")),
                _safe_str(t.get("last4")),
                _safe_str(t.get("pending_review")),
                _safe_str(t.get("raw_hash")),
            ])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    headers = {
        "Content-Disposition": f'attachment; filename="mintu_transactions_{datetime.now().strftime("%Y%m%d")}.csv"',
        "Cache-Control": "no-cache",
    }
    return StreamingResponse(gen(), media_type="text/csv", headers=headers)


@router.get("/budgets.csv")
async def export_budgets_csv(user_id: str = Depends(get_current_user)):
    cursor = db.budgets.find({"user_id": user_id}).sort("category", 1)

    async def gen():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["category", "period", "limit", "spent", "remaining", "status"])
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        async for b in cursor:
            limit = float(b.get("limit") or 0)
            spent = float(b.get("spent") or 0)
            remaining = limit - spent
            status = "over" if remaining < 0 else ("near" if remaining < limit * 0.15 else "ok")
            w.writerow([
                _safe_str(b.get("category")),
                _safe_str(b.get("period")),
                limit, spent, remaining, status,
            ])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    headers = {
        "Content-Disposition": f'attachment; filename="mintu_budgets_{datetime.now().strftime("%Y%m%d")}.csv"',
        "Cache-Control": "no-cache",
    }
    return StreamingResponse(gen(), media_type="text/csv", headers=headers)


@router.get("/all.json")
async def export_all_json(user_id: str = Depends(get_current_user)):
    """Full data bundle as a single JSON download.

    Includes transactions, budgets, goals + a metadata block with the
    export timestamp + record counts. Suitable for backup / migration.
    """
    txns = await db.transactions.find({"user_id": user_id}).sort("date", -1).to_list(20000)
    budgets = await db.budgets.find({"user_id": user_id}).to_list(500)
    goals = await db.goals.find({"user_id": user_id}).to_list(500)

    def _clean(rows: list[dict]) -> list[dict]:
        out: list[dict] = []
        for r in rows:
            r = dict(r)
            r["id"] = str(r.pop("_id", ""))
            for k, v in list(r.items()):
                if isinstance(v, datetime):
                    r[k] = v.isoformat()
            out.append(r)
        return out

    bundle = {
        "metadata": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "counts": {
                "transactions": len(txns),
                "budgets": len(budgets),
                "goals": len(goals),
            },
            "format_version": 1,
        },
        "transactions": _clean(txns),
        "budgets": _clean(budgets),
        "goals": _clean(goals),
    }
    headers = {
        "Content-Disposition": f'attachment; filename="mintu_export_{datetime.now().strftime("%Y%m%d")}.json"',
        "Cache-Control": "no-cache",
    }

    async def gen():
        yield json.dumps(bundle, ensure_ascii=False, indent=2)

    return StreamingResponse(gen(), media_type="application/json", headers=headers)
