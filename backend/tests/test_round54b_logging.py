"""Tests for core/logging_config.py — Round 54b structured JSON logging."""
from __future__ import annotations

import io
import json
import logging
import os
import sys

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

# Ensure backend is on sys.path when running from project root.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.logging_config import (  # noqa: E402
    JsonFormatter,
    RequestLogMiddleware,
    setup_logging,
)


def _capture_log_line(env: dict, fn) -> str:
    """Run `fn()` with a captured stdout under the given env, return last line."""
    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    old_handlers = root.handlers[:]
    old_level = root.level
    root.handlers = [handler]
    root.setLevel(logging.DEBUG)
    try:
        for k, v in env.items():
            os.environ[k] = v
        fn()
    finally:
        root.handlers = old_handlers
        root.setLevel(old_level)
        for k in env:
            os.environ.pop(k, None)
    lines = [ln for ln in buf.getvalue().split("\n") if ln.strip()]
    return lines[-1] if lines else ""


def test_json_formatter_emits_envelope():
    """JsonFormatter must include ts/level/logger/msg + extras."""
    line = _capture_log_line(
        {},
        lambda: logging.getLogger("t1").info(
            "hi", extra={"foo": 1, "bar": "baz"}
        ),
    )
    obj = json.loads(line)
    assert obj["level"] == "INFO"
    assert obj["msg"] == "hi"
    assert obj["logger"] == "t1"
    assert obj["foo"] == 1
    assert obj["bar"] == "baz"
    assert "ts" in obj and obj["ts"].endswith("Z")


def test_json_formatter_handles_non_serialisable_extras():
    """Exotic types (objects, sets) must coerce to str(), not crash."""
    class Weird:
        def __repr__(self) -> str:
            return "<Weird>"

    line = _capture_log_line(
        {},
        lambda: logging.getLogger("t2").info(
            "edge", extra={"weird": Weird(), "set_field": {1, 2}}
        ),
    )
    obj = json.loads(line)
    assert obj["weird"] == "<Weird>"
    # set is unordered → just check it stringified
    assert "set_field" in obj


def test_json_formatter_serialises_exceptions():
    """exc_info should be folded into a `stack` string field."""
    def go():
        try:
            raise ValueError("kaboom")
        except ValueError:
            logging.getLogger("t3").exception("boom")

    line = _capture_log_line({}, go)
    obj = json.loads(line)
    assert obj["level"] == "ERROR"
    assert "ValueError" in obj["stack"]
    assert "kaboom" in obj["stack"]


def test_setup_logging_json_mode_idempotent():
    """Calling setup_logging() twice in JSON mode must not stack handlers."""
    os.environ["LOG_FORMAT"] = "json"
    try:
        setup_logging()
        setup_logging()  # second call must be a no-op
        root = logging.getLogger()
        json_handlers = [h for h in root.handlers if isinstance(h.formatter, JsonFormatter)]
        assert len(json_handlers) == 1
    finally:
        os.environ.pop("LOG_FORMAT", None)
        # Restore default text logging for downstream tests.
        logging.getLogger().handlers[:] = []


def test_request_log_middleware_emits_per_request():
    """Hitting an endpoint must produce one access log JSON line."""
    app = FastAPI()
    app.add_middleware(RequestLogMiddleware)

    @app.get("/api/widgets/{wid}")
    def widget(wid: str):
        return {"id": wid}

    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setFormatter(JsonFormatter())
    access = logging.getLogger("access")
    old = access.handlers[:]
    access.handlers = [handler]
    access.propagate = False
    try:
        client = TestClient(app)
        r = client.get("/api/widgets/abc")
        assert r.status_code == 200
        assert r.headers.get("x-request-id"), "X-Request-Id must be set"
    finally:
        access.handlers = old

    lines = [ln for ln in buf.getvalue().split("\n") if ln.strip()]
    assert len(lines) == 1, f"expected 1 access line, got {len(lines)}: {buf.getvalue()!r}"
    obj = json.loads(lines[0])
    assert obj["msg"] == "request"
    assert obj["method"] == "GET"
    # Must use the route TEMPLATE not the literal path (so `/widgets/{wid}` not `/widgets/abc`).
    assert obj["route"] == "/api/widgets/{wid}"
    assert obj["path"] == "/api/widgets/abc"
    assert obj["status"] == 200
    assert obj["latency_ms"] >= 0
    assert obj["request_id"]


def test_request_log_middleware_skips_health_probes():
    """Liveness/readiness probes must not pollute the access log."""
    app = FastAPI()
    app.add_middleware(RequestLogMiddleware)

    @app.get("/api/health/live")
    def live():
        return {"ok": True}

    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setFormatter(JsonFormatter())
    access = logging.getLogger("access")
    old = access.handlers[:]
    access.handlers = [handler]
    access.propagate = False
    try:
        client = TestClient(app)
        r = client.get("/api/health/live")
        assert r.status_code == 200
    finally:
        access.handlers = old

    lines = [ln for ln in buf.getvalue().split("\n") if ln.strip()]
    assert lines == [], f"health probe must NOT log; got: {lines!r}"


def test_request_log_middleware_records_error_status():
    """Even 4xx/5xx responses must produce an access log line."""
    app = FastAPI()
    app.add_middleware(RequestLogMiddleware)

    @app.get("/api/oops")
    def oops():
        from fastapi import HTTPException
        raise HTTPException(status_code=418, detail="i'm a teapot")

    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setFormatter(JsonFormatter())
    access = logging.getLogger("access")
    old = access.handlers[:]
    access.handlers = [handler]
    access.propagate = False
    try:
        client = TestClient(app)
        r = client.get("/api/oops")
        assert r.status_code == 418
    finally:
        access.handlers = old

    lines = [ln for ln in buf.getvalue().split("\n") if ln.strip()]
    assert len(lines) == 1
    obj = json.loads(lines[0])
    assert obj["status"] == 418


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-v"])
