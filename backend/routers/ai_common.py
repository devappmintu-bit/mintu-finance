"""Shared primitives for ai-* routers (router, ChatMessage, lazy-loader)."""
"""AI router — agent-chat, proactive-nudges, voice, money-school, waste-detector, insights/daily, ai-expense-card.

Lazy-imports legacy helpers from server.py (AGENT_PROFILES, route_to_agent, generate_insights_with_ai,
get_lang_instruction, MONEY_SCHOOL_LESSONS, etc.) to avoid circular imports while keeping routes modular.
"""
import os
import logging
import random
from datetime import datetime, timedelta, date
from typing import Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from core import db, get_current_user, cache_get, cache_set
from core.scoring import calculate_money_score
from core.constants import (
    INDIA_POPULATION_2025,
    AGENT_PROFILES, route_to_agent,
    MONEY_SCHOOL_LESSONS, MONEY_SCHOOL_CARDS, XP_LEVELS,
    get_lang_instruction,
    build_equivalences,
)

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from emergentintegrations.llm.openai import OpenAISpeechToText
except Exception:  # pragma: no cover
    LlmChat = UserMessage = OpenAISpeechToText = None  # type: ignore


# Pydantic model for /ai/chat — kept local to avoid circular import.
class ChatMessage(BaseModel):
    message: str
    lang: Optional[str] = "en"


# `generate_insights_with_ai` still lives in server.py (depends on db + LLM client
# that are bootstrapped there). Resolve it lazily to avoid circular import.
def _lazy_server_attr(name: str):
    """Lazily fetch a helper from server.py — avoids circular import at module load."""
    import importlib
    srv = importlib.import_module("server")
    return getattr(srv, name, None)


# Shared APIRouter that ai_insights.py and ai_coach.py both decorate on.
router = APIRouter(tags=["ai"])
api_router = router
