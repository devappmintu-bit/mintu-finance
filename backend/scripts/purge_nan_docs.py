"""One-shot purge: delete any transaction/budget with non-finite amount (NaN/±Inf)
left over from adversarial red-team tests. Safe to re-run."""
import asyncio
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "mintu_db")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    total_deleted = 0
    for coll_name in ("transactions", "budgets", "split_expenses", "settlements"):
        coll = db[coll_name]
        bad_ids = []
        async for doc in coll.find({}):
            amt = doc.get("amount")
            try:
                if isinstance(amt, (int, float)) and not math.isfinite(float(amt)):
                    bad_ids.append(doc["_id"])
            except Exception:
                bad_ids.append(doc["_id"])
        if bad_ids:
            res = await coll.delete_many({"_id": {"$in": bad_ids}})
            print(f"[{coll_name}] purged {res.deleted_count} docs with NaN/Inf amount")
            total_deleted += res.deleted_count
        else:
            print(f"[{coll_name}] clean — 0 non-finite amounts found")

    print(f"\n✅ Total purged: {total_deleted}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
