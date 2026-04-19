"""ai router aggregator — retained for backward import compatibility.

Actual endpoint definitions now live in:
    - ai_common.py    (shared APIRouter, ChatMessage, lazy-loader helper)
    - ai_insights.py  (insights/daily, money-school/*, waste-detector, nudges, expense-card)
    - ai_coach.py     (ai/chat, ai/agent-chat, voice/transcribe, ai/memory, ai/agents)

Importing these modules registers their routes on the shared APIRouter.
"""
from routers.ai_common import router, api_router  # noqa: F401
from routers import ai_insights  # noqa: F401
from routers import ai_coach     # noqa: F401
