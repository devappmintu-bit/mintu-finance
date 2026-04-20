"""core/ids.py — Safe ObjectId parsing helpers.

Why this exists
---------------
Many endpoints take a MongoDB `_id` as either a path param or a body field.
Raw `bson.ObjectId(s)` raises `InvalidId` on malformed input, which bubbles up
as an uncaught 500 Internal Server Error. This is a defense-in-depth concern —
the frontend always sends 24-char hex IDs, but malformed input from tests,
scrapers, or future API consumers must fail with a clean 400, never 500.

Usage
-----
    from core.ids import safe_oid, try_oid

    # Route handler — raises HTTPException(400) on malformed input
    @router.get("/things/{thing_id}")
    async def get_thing(thing_id: str):
        oid = safe_oid(thing_id, field_name="thing_id")
        doc = await db.things.find_one({"_id": oid})
        ...

    # Best-effort lookup — returns None if invalid
    oid = try_oid(maybe_id)
    if oid is None: return None
    doc = await db.users.find_one({"_id": oid})
"""
from typing import Optional
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException


def safe_oid(value: str, *, field_name: str = "id") -> ObjectId:
    """Convert a string to ObjectId or raise HTTPException(400).

    Use this in route handlers for path/body params that should hit a DB lookup.
    Surfacing a clean 400 beats letting `InvalidId` become a 500.
    """
    if not isinstance(value, str) or len(value) != 24:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")
    try:
        return ObjectId(value)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")


def try_oid(value) -> Optional[ObjectId]:
    """Best-effort conversion — returns None for anything non-conforming.

    Use this when an endpoint wants to silently skip an invalid ID (e.g.
    batch resolvers, analytics fan-out) rather than fail the whole request.
    """
    if not isinstance(value, str) or len(value) != 24:
        return None
    try:
        return ObjectId(value)
    except InvalidId:
        return None
