"""MintU FastAPI server — bootstrap, security middleware, auth routes.

All domain logic lives in routers/*.py. Shared static data lives in core/constants.py.
Pydantic schemas live in schemas.py. This file stays intentionally thin.
"""
from fastapi import FastAPI, APIRouter, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ══════════════════════════════════════════════════════════════════════
#  DATABASE + JWT CONFIG
# ══════════════════════════════════════════════════════════════════════
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30


# ══════════════════════════════════════════════════════════════════════
#  AUTH HELPERS — extracted to core/auth_helpers.py (Round 53h)
#  Re-exported here so legacy callers that do
#  ``from server import hash_password`` keep working unchanged.
# ══════════════════════════════════════════════════════════════════════
from core.auth_helpers import (  # noqa: E402,F401
    hash_password, verify_password, create_token,
)



# ══════════════════════════════════════════════════════════════════════
#  IN-MEMORY TTL CACHE — re-exports from core.cache for backwards compat
# ══════════════════════════════════════════════════════════════════════
# Phase 3 consolidation: previously server.py carried its own _CACHE +
# duplicate functions. That split the cache across two modules — imports
# from `server.cache_*` and `core.cache.cache_*` used DIFFERENT dicts,
# which silently broke invalidation for any router that mixed them.
# All cache ops now flow through core.cache as the single source of truth.
from core.cache import (  # noqa: E402,F401
    cache_get,
    cache_set,
    cache_clear_prefix,
)


# ══════════════════════════════════════════════════════════════════════
#  SECURITY CONFIGURATION + MIDDLEWARE (extracted to core/middleware.py)
# ══════════════════════════════════════════════════════════════════════
from core.middleware import (  # noqa: E402,F401
    SecurityHeadersMiddleware,
    RateLimitMiddleware,
    AuditLogMiddleware,
    RATE_LIMIT_WINDOW,
    RATE_LIMIT_MAX_REQUESTS,
    AUTH_RATE_LIMIT_MAX,
    BRUTE_FORCE_LOCKOUT_MINUTES,
    BRUTE_FORCE_MAX_FAILURES,
    SENSITIVE_FIELDS,
    DATA_RETENTION_DAYS,
    OTP_DATA_RETENTION_MINUTES,
)


# ══════════════════════════════════════════════════════════════════════
#  FASTAPI APP
# ══════════════════════════════════════════════════════════════════════
app = FastAPI(
    title="MintU API",
    description="AI-powered personal finance assistant",
    docs_url=None,
    redoc_url=None,
)
api_router = APIRouter(prefix="/api")


# ══════════════════════════════════════════════════════════════════════
#  OBSERVABILITY — Round 53e
#
#  Sentry SDK init runs at import time (BEFORE any other middleware so
#  the SDK can wrap all subsequent layers). When SENTRY_DSN_BACKEND is
#  unset/empty, init_sentry() is a no-op — local dev stays silent.
#  SentryContextMiddleware tags every request with request_id, endpoint,
#  user_id, and a hashed Idempotency-Key for correlation.
# ══════════════════════════════════════════════════════════════════════
from core.observability import init_sentry, SentryContextMiddleware  # noqa: E402
init_sentry()
app.add_middleware(SentryContextMiddleware)


# ══════════════════════════════════════════════════════════════════════
#  STRUCTURED JSON LOGGING — Round 54b
#
#  Switch stdout to JSON when LOG_FORMAT=json (default = text for dev).
#  Adds a per-request `access` log line with method, route, status,
#  latency_ms, request_id, user_id, and bytes_out — exactly what
#  Loki/ELK/CloudWatch expect for SLO dashboards.
#
#  Health endpoints are skipped to keep the access log signal-rich
#  (k8s probes hit /api/health/live every second).
# ══════════════════════════════════════════════════════════════════════
from core.logging_config import setup_logging, RequestLogMiddleware  # noqa: E402
setup_logging()
app.add_middleware(RequestLogMiddleware)


# ══════════════════════════════════════════════════════════════════════
#  HEALTH CHECK — Round 51f + Production Readiness Audit
#
#  Three endpoints exposing the canonical Kubernetes liveness/readiness
#  contract:
#    GET /api/health        → legacy alias for /health/live
#    GET /api/health/live   → process is responsive (no DB call)
#    GET /api/health/ready  → process AND every critical dependency
#                              (MongoDB) are reachable within 1500 ms.
#
#  The ready-probe deliberately fails closed: a slow Mongo means the
#  pod should NOT receive traffic. The live-probe always returns 200
#  unless the event-loop itself is dead — Kubernetes will then SIGKILL.
# ══════════════════════════════════════════════════════════════════════
@api_router.get("/health")
def health_check() -> dict:
    """Legacy ping — kept for backward compatibility with existing
    monitors and the old test suite. New consumers SHOULD use
    /health/live or /health/ready instead."""
    return {"status": "ok", "version": "1.0.0"}


@api_router.get("/health/live")
def health_live() -> dict:
    """Liveness probe — only checks the FastAPI event-loop is alive.
    Kubernetes uses this to decide if the pod should be restarted."""
    return {"status": "alive", "version": "1.0.0"}


@api_router.get("/health/ready")
async def health_ready() -> dict:
    """Readiness probe — pod is healthy AND every critical dependency
    (MongoDB) responds within 1.5 s. Returns 503 if any dependency
    is degraded so K8s removes the pod from the service rotation."""
    import asyncio
    from fastapi import HTTPException
    deps: dict = {"mongo": "unknown"}
    try:
        from core.db import db  # local import — avoid boot-time cycles
        # Cheap admin-level ping with a hard timeout so a slow Mongo
        # never blocks the probe.
        await asyncio.wait_for(db.command("ping"), timeout=1.5)
        deps["mongo"] = "ok"
    except asyncio.TimeoutError:
        deps["mongo"] = "timeout"
    except Exception as exc:  # noqa: BLE001 — capture anything Mongo throws
        deps["mongo"] = f"down: {type(exc).__name__}"

    overall_ok = all(v == "ok" for v in deps.values())
    if not overall_ok:
        raise HTTPException(status_code=503, detail={"status": "degraded", "deps": deps})
    return {"status": "ready", "version": "1.0.0", "deps": deps}


# ══════════════════════════════════════════════════════════════════════
#  ROUTE-STATS TELEMETRY — Round 51i
#
#  Per-route p50/p95/p99 latency + error-rate, via an in-memory ring
#  buffer populated by an ASGI middleware. Read at GET /api/admin/
#  route-stats (admin-only — gated by ADMIN_PHONES env var).
#
#  Goal: data-driven decisions on which endpoints to optimise next.
#  See backend/core/route_stats.py for design notes.
# ══════════════════════════════════════════════════════════════════════
from core.route_stats import RouteStatsRecorder, build_admin_router  # noqa: E402
app.add_middleware(RouteStatsRecorder)
api_router.include_router(build_admin_router())

# Round 100N — Mission Backbone (Outcome Guarantee System).
# Mounts /api/missions/{current,seed,contribute}. The router was
# parked since R99I and is now activated as part of the Mission MVP.
from routers.missions import router as missions_router  # noqa: E402
api_router.include_router(missions_router)
# R109 — power-user data export (CSV / JSON snapshots).
from routers.export_data import router as export_router  # noqa: E402
api_router.include_router(export_router)
# R111 — Money Pulse v2 (Inshorts-for-personal-finance, real RSS pipeline).
from routers.pulse_v2 import router as pulse_v2_router, pulse_refresher_worker  # noqa: E402
api_router.include_router(pulse_v2_router)


# ── Validation + InvalidId handlers (extracted to core/responses.py) ────
from core.responses import (  # noqa: E402,F401
    _SafeJSONResponse,
    _scrub_nonfinite,
    register_exception_handlers,
)
register_exception_handlers(app)
# ────────────────────────────────────────────────────────────────────────


# ══════════════════════════════════════════════════════════════════════
#  INPUT SANITIZATION (extracted to core/sanitize.py — Round 53h)
# ══════════════════════════════════════════════════════════════════════
from core.sanitize import sanitize_string, sanitize_phone  # noqa: E402,F401


# ══════════════════════════════════════════════════════════════════════
#  CONSTANTS + PYDANTIC SCHEMAS (re-exports for back-compat)
# ══════════════════════════════════════════════════════════════════════
# Pydantic schemas — everything routers may still import from server
from schemas import *  # noqa: F401,F403,E402

# Static data + helpers — single source of truth in core/constants.py
from core.constants import (  # noqa: F401,E402
    INDIA_POPULATION_2025,
    MONEY_SCHOOL_LESSONS, MONEY_SCHOOL_CARDS, XP_LEVELS,
    AGENT_PROFILES, route_to_agent,
    WASTE_EQUIVALENCES, build_equivalences,
    PREMIUM_FEATURES, PRICING,
    UPI_APPS, SETTLEMENT_REWARDS,
    SAMPLE_INDIAN_SMS,
    LANG_NAMES, get_lang_instruction,
)

# Scoring helper re-exported from core/
from core.scoring import calculate_money_score  # noqa: F401,E402

# UPI helpers re-exported from core/
from core.upi import validate_upi_id, mask_upi_id  # noqa: F401,E402

# App download link + daily cards from core/content.py
from core.content import APP_DOWNLOAD_LINK, DAILY_CARDS  # noqa: F401,E402


# ══════════════════════════════════════════════════════════════════════
#  AUTH HELPERS — back-compat get_current_user delegation
# ══════════════════════════════════════════════════════════════════════
async def get_current_user(authorization: str = Header(...)) -> str:
    """Back-compat shim — delegates to the single hardened implementation in
    core/auth.py. Previously this file had a duplicate that skipped the
    dead-token DB check (Round 29 landmine). Keeping only the delegation
    so any residual `from server import get_current_user` call site
    still gets the correct, hardened behaviour."""
    from core.auth import get_current_user as _gcu
    return await _gcu(authorization)


# ══════════════════════════════════════════════════════════════════════
#  AI HELPERS (extracted to core/ai_helpers.py — re-exports for back-compat)
# ══════════════════════════════════════════════════════════════════════
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from emergentintegrations.llm.openai import OpenAISpeechToText  # noqa: F401
except Exception:  # pragma: no cover
    LlmChat = UserMessage = OpenAISpeechToText = None  # type: ignore

from core.ai_helpers import (  # noqa: E402,F401
    parse_sms_with_ai,
    generate_insights_with_ai,
    send_expo_push,
)


# ══════════════════════════════════════════════════════════════════════
#  RAZORPAY CLIENT — extracted to core/razorpay_client.py (Round 53h)
# ══════════════════════════════════════════════════════════════════════
from core.razorpay_client import razorpay_client  # noqa: E402,F401


# ══════════════════════════════════════════════════════════════════════
#  AUTH ROUTES — register, login, OTP send/verify/resend
# ══════════════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════════════
#  LEGACY AUTH SHIMS — actual endpoints relocated to routers/auth.py
#  on Apr 21 2026. Only these module-level helpers remain for
#  back-compat with a handful of callers in other routers.
# ══════════════════════════════════════════════════════════════════════
OTP_EXPIRY_MINUTES = 5
MAX_OTP_ATTEMPTS = 3
MOCK_OTP_MODE = True

def generate_otp() -> str:
    from routers.auth import generate_otp as _g
    return _g()


async def send_otp_sms(phone: str, otp: str) -> bool:
    from routers.auth import send_otp_sms as _s
    return await _s(phone, otp)


# ══════════════════════════════════════════════════════════════════════
#  MOUNT DOMAIN ROUTERS (extracted to core/router_registry.py — Round 53h)
#  Adding a new router is now a one-line edit in router_registry.py.
# ══════════════════════════════════════════════════════════════════════
from core.router_registry import register_domain_routers  # noqa: E402
register_domain_routers(api_router)

app.include_router(api_router)


# ══════════════════════════════════════════════════════════════════════
#  MIDDLEWARE REGISTRATION (order matters — last added runs first)
# ══════════════════════════════════════════════════════════════════════
# Round 99 — Idempotency-Key enforcement on financial mutations.
# Installed BEFORE the other security middlewares so it runs LAST in
# the request chain (Starlette stacks middleware in reverse) — meaning
# Idempotency runs first, gets to short-circuit a replayed call before
# we even hit auth/audit overhead. Warn-only by default; flip
# IDEMPOTENCY_REQUIRED=1 in env to hard-enforce.
from core.idempotency_middleware import IdempotencyMiddleware  # noqa: E402
app.add_middleware(IdempotencyMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(AuditLogMiddleware)
# ── CORS — production-safe allowlist ─────────────────────────────────
# Production audit fix: never ship `allow_origins=["*"]` alongside
# `allow_credentials=True`. The combo is rejected by every modern
# browser AND opens the API to drive-by hits from any malicious site.
#
# We read the allowlist from env at boot. Local dev keeps the
# permissive default; production sets ALLOWED_ORIGINS to the actual
# frontend domains (comma-separated, no trailing slashes).
#   ALLOWED_ORIGINS="https://app.mintu.in,https://*.emergentagent.com"
#
# `allow_origin_regex` covers wildcard subdomains (Emergent preview
# URLs) without using the literal "*" hole.
import os as _os
_raw_origins = _os.getenv("ALLOWED_ORIGINS", "").strip()
if _raw_origins:
    _allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    _allow_origin_regex = _os.getenv("ALLOWED_ORIGIN_REGEX") or None
else:
    # Dev fallback: allow Expo packager + localhost so the existing
    # local workflow (yarn web, Expo Go via tunnel) keeps working.
    _allow_origins = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:19006",
    ]
    # Default regex covers every emergentagent.com preview deployment,
    # so deploys on the Emergent platform Just Work without needing a
    # post-deploy env-var change.
    _allow_origin_regex = r"^https://([a-z0-9-]+\.)*emergentagent\.com$"

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_allow_origins,
    allow_origin_regex=_allow_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════
#  LOGGING
# ══════════════════════════════════════════════════════════════════════
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
#  STARTUP / SHUTDOWN (extracted to core/lifecycle.py)
# ══════════════════════════════════════════════════════════════════════
from core.lifecycle import register_lifecycle  # noqa: E402
register_lifecycle(app, db, client)
