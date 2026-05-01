"""MongoDB client singleton — imported by all route modules.

Production-readiness audit fix (2026-05-01):
The default Motor client uses a 30s server-selection timeout, which
means a slow / disconnected Mongo can stall every single API call for
up to 30 seconds before failing — the user sees a "loading…" forever.

We tighten the timeouts so a degraded Mongo fails fast (≤ 5 s) and the
readiness probe can correctly mark the pod as not-ready before the
service rotation forwards traffic to a doomed instance.

Tuning rationale:
  serverSelectionTimeoutMS = 5_000   → fail-fast over a 30 s default
  connectTimeoutMS         = 5_000   → bail if the TCP handshake
                                       takes more than 5 s
  socketTimeoutMS          = 20_000  → individual operation cap; a
                                       slow query won't hold the
                                       connection forever
  maxPoolSize              = 50      → leaves headroom for the BFF
                                       /api/home/bundle which fans
                                       out into 6 parallel queries
                                       per request
"""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

# Load .env from backend/ — safe to call again (idempotent)
load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=5_000,
    connectTimeoutMS=5_000,
    socketTimeoutMS=20_000,
    maxPoolSize=50,
    # Retry once on transient errors (network blip / primary failover);
    # default but spelled out for clarity.
    retryWrites=True,
)
db = client[os.environ["DB_NAME"]]
