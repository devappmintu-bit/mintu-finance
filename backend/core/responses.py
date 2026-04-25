"""core/responses.py — Custom response classes + exception handlers.

Extracted from server.py (Round 30f) so bootstrap stays thin.

What this module provides
-------------------------
• ``_scrub_nonfinite(obj)``  — recursively replace NaN/±Inf floats so the JSON
  encoder never chokes on pydantic's `input` echo-backs.
• ``SafeJSONResponse``        — JSON response class that survives non-finite
  values and BSON/ObjectId-ish payloads.
• ``register_exception_handlers(app)`` — attach the validation + InvalidId
  handlers to the FastAPI ``app`` so every route benefits.

Back-compat
-----------
``_SafeJSONResponse`` and ``_scrub_nonfinite`` are re-exported from server.py
under the same names for any legacy import path.
"""
from __future__ import annotations

import json as _json
import math as _math
from typing import Any

from bson.errors import InvalidId as _InvalidId
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.responses import Response as _StarletteResponse


def _scrub_nonfinite(obj: Any) -> Any:
    """Recursively scrub NaN/±Inf floats so stdlib json never raises.

    Also coerces ``bytes``, ``BaseException`` and other non-JSON-native
    types into safe serialisable shapes. Used by the validation handler
    where pydantic echoes back user-supplied values that may include
    `float('nan')` → boom under ``allow_nan=False``.
    """
    if isinstance(obj, float) and not _math.isfinite(obj):
        return f"<non-finite:{obj}>"
    if isinstance(obj, list):
        return [_scrub_nonfinite(x) for x in obj]
    if isinstance(obj, tuple):
        return [_scrub_nonfinite(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _scrub_nonfinite(v) for k, v in obj.items()}
    if isinstance(obj, bytes):
        try:
            return _scrub_nonfinite(_json.loads(obj))
        except Exception:
            return obj.decode("utf-8", errors="replace")
    if isinstance(obj, BaseException):
        # Pydantic may stash the raw ValueError in the errors ctx dict.
        return str(obj)
    # Any remaining non-JSON-native type → coerce to str (last resort).
    if not isinstance(obj, (str, int, bool, type(None))):
        try:
            _json.dumps(obj)     # probe: is it serialisable?
            return obj
        except Exception:
            return repr(obj)
    return obj


class SafeJSONResponse(_StarletteResponse):
    """JSON response class that tolerates NaN/Inf/exotic types."""

    media_type = "application/json"

    def render(self, content) -> bytes:
        return _json.dumps(
            _scrub_nonfinite(content),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")


# Legacy alias — server.py used the underscore-prefixed name.
_SafeJSONResponse = SafeJSONResponse


def register_exception_handlers(app: FastAPI) -> None:
    """Attach safe validation + InvalidId handlers to the FastAPI ``app``.

    FastAPI's default 422 response echoes the invalid `input` back to the
    client. When that input is a non-finite float (NaN / ±Infinity / etc.),
    Starlette's default JSONResponse renders with ``allow_nan=False`` and
    crashes → client sees 500 instead of 422. We fix this by scrubbing
    non-finite floats in the error/body payload.

    Similarly, invalid ObjectIds from malformed path params should never
    crash downstream — they become a clean 400.
    """

    @app.exception_handler(RequestValidationError)
    async def _validation_exception_handler(request: Request, exc: RequestValidationError):  # noqa: D401
        errors = _scrub_nonfinite(exc.errors())
        body = _scrub_nonfinite(getattr(exc, "body", None))
        return SafeJSONResponse(status_code=422, content={"detail": errors, "body": body})

    @app.exception_handler(_InvalidId)
    async def _invalid_objectid_handler(request: Request, exc: _InvalidId):  # noqa: D401
        """Catches every bare ``ObjectId("not-a-hex")`` across all routers → 400.

        Defense-in-depth so downstream handlers don't have to wrap every
        ObjectId call.
        """
        return SafeJSONResponse(status_code=400, content={"detail": "Invalid ID format"})

    # Round 41 — catch-all so unhandled exceptions never leak stack traces or
    # internal file paths to the client. In dev (ENV=development) we include
    # a `debug` field so engineers can still diagnose; in prod the response
    # is purely a generic friendly message.
    import os
    import logging
    _logger = logging.getLogger("error_handler")
    _is_dev = (os.getenv("ENV", "").lower() in ("dev", "development", "local")) or bool(os.getenv("DEBUG"))

    @app.exception_handler(Exception)
    async def _catch_all_exception_handler(request: Request, exc: Exception):  # noqa: D401
        # Log the full traceback server-side so we don't lose diagnostic info.
        _logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        body: dict = {"detail": "An internal error occurred. Please try again."}
        if _is_dev:
            body["debug"] = f"{type(exc).__name__}: {str(exc)[:500]}"
        return SafeJSONResponse(status_code=500, content=body)


__all__ = [
    "SafeJSONResponse",
    "_SafeJSONResponse",
    "_scrub_nonfinite",
    "register_exception_handlers",
]
