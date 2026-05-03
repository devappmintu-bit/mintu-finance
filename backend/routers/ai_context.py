"""AI Context-Response endpoint (v10 "AI → drives product").

Accepts a mode + full user financial context snapshot and returns a
structured JSON response the frontend brain can render directly:

    {
      "insight":   "...",            # short data-grounded insight
      "actions":   [{ "label":"...", "cta":"open_expense|open_budget|...|chat" }],
      "deep_analysis": ["...", ...],
      "priority":  "low|med|high"
    }

Registers on the shared api_router from routers.ai_common.
"""
from __future__ import annotations
import json
import logging
from typing import Any, Dict, List, Optional, Literal

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from core.llm_safe import safe_send
from core.llm_cache import get_or_regen
from routers.ai_common import (
    api_router, get_current_user, _lazy_server_attr, LlmChat, UserMessage,
)
from core.constants import get_lang_instruction

log = logging.getLogger(__name__)

MODES = {
    'score_boost':    "Boost user's money score",
    'plan_build':     "Build a 5-minute money plan",
    'expense_help':   "Help user log or diagnose an expense",
    'budget_optimize':"Optimize budgets against actual spend",
    'goal_strategy':  "Strategy to reach goals faster",
    'split_advice':   "Settle or collect split balances",
    'daily_brief':    "Daily finance brief + next action",
    'waste_detector': "Find wasteful spending and suggest cuts",
    'what_if':        "Project what happens if user changes a spend/save habit",
    'home_pulse':     "One-liner status for the home hero",
    'peer_compare':   "Benchmark user against peer cohort at their income/age bracket",
    'mom_compare':    "Compare current month against previous month",
    'free':           "Open-ended query",
}


class CtxRequest(BaseModel):
    mode: str = Field(default='free')
    source: Optional[str] = None
    prompt: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)
    lang: Optional[str] = 'en'


SYSTEM_PROMPT = """You are MintU AI — a financial advisor for Indian users.

You MUST:
- Use REAL user data provided below. Never assume.
- Give ACTIONABLE advice grounded in the numbers you see.
- Prioritize the single best next action.
- Keep responses short, direct, Indian context (₹, INR).
- Never give generic advice or motivational fluff.

Respond ONLY as a valid JSON object matching this schema:
{
  "insight": "<one short paragraph, <= 280 chars, data-grounded>",
  "actions": [
    { "label": "<short action>", "cta": "<open_expense|open_budget|open_goal|open_split|open_score|chat>" }
  ],
  "deep_analysis": [ "<short bullet 1>", "<short bullet 2>" ],
  "priority": "<low|med|high>"
}
"""


def _deterministic_fallback(mode: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Zero-data / offline / LLM-failure fallback. Always actionable."""
    tx = ctx.get('transactions') or {}
    goals = ctx.get('goals') or {}
    budgets = ctx.get('budgets') or {}
    insights = ctx.get('insights') or {}
    count = int(tx.get('count') or 0)
    if count == 0:
        return {
            'insight': "You haven't started tracking yet. Without transactions, I can't optimize your money. Let's fix that first.",
            'actions': [
                {'label': 'Add first expense', 'cta': 'open_expense'},
                {'label': 'Set your first budget', 'cta': 'open_budget'},
                {'label': 'Create a savings goal', 'cta': 'open_goal'},
            ],
            'deep_analysis': [],
            'priority': 'high',
        }
    if mode == 'budget_optimize' and insights.get('overspending'):
        return {
            'insight': f"Over budget: {insights['overspending'][0]}. One swap can pull you back under.",
            'actions': [
                {'label': 'See overspend details', 'cta': 'open_budget'},
                {'label': 'Ask AI for a 2-min fix', 'cta': 'chat'},
            ],
            'deep_analysis': insights['overspending'][:2],
            'priority': 'high',
        }
    # ───── peer_compare — benchmark vs similar users (uses insights.peer) ─────
    if mode == 'peer_compare':
        monthly = int(tx.get('monthlySpend') or 0)
        peer = (ctx.get('insights') or {}).get('peer') or {}
        peer_median = int(peer.get('median_spend') or 0)
        score_pct = int(peer.get('score_percentile') or 0)
        score_val = int((ctx.get('score') or {}).get('value') or 0)
        if peer_median > 0 and monthly > 0:
            diff = monthly - peer_median
            pct = round((diff / peer_median) * 100)
            if diff > 0:
                return {
                    'insight': f"You spend ₹{abs(diff):,}/mo ({abs(pct)}%) MORE than peers at your bracket. Trim a cuttable category → instant upgrade.",
                    'actions': [
                        {'label': 'Find cuttable category', 'cta': 'open_budget'},
                        {'label': 'See what AI suggests',   'cta': 'chat'},
                    ],
                    'deep_analysis': [f"Peer median ₹{peer_median:,}", f"You: ₹{monthly:,}"],
                    'priority': 'high' if abs(pct) >= 20 else 'med',
                }
            return {
                'insight': f"You spend ₹{abs(diff):,}/mo ({abs(pct)}%) LESS than peers. Redirect the surplus into a goal.",
                'actions': [{'label': 'Start a goal', 'cta': 'open_goal'}],
                'deep_analysis': [f"Peer median ₹{peer_median:,}", f"You: ₹{monthly:,}"],
                'priority': 'low',
            }
        # No peer data yet → score percentile is the next best signal
        if score_pct > 0:
            top = max(1, 100 - score_pct)
            return {
                'insight': f"Your Money Score {score_val} puts you in the TOP {top}% of savers. Keep logging — compounding your rank is easier than earning it.",
                'actions': [{'label': 'Protect streak', 'cta': 'open_expense'}],
                'deep_analysis': [],
                'priority': 'low',
            }
        return {
            'insight': f"Not enough data yet to benchmark you. Log ~30 txns to unlock peer comparison.",
            'actions': [{'label': 'Log expense', 'cta': 'open_expense'}],
            'deep_analysis': [],
            'priority': 'med',
        }
    # ───── mom_compare — month-over-month delta ─────
    if mode == 'mom_compare':
        mom = (ctx.get('insights') or {}).get('mom') or {}
        cur = int(mom.get('current_spend') or (ctx.get('transactions') or {}).get('monthlySpend') or 0)
        prev = int(mom.get('previous_spend') or 0)
        if prev > 0:
            diff = cur - prev
            pct = round((diff / prev) * 100)
            if diff > 0:
                return {
                    'insight': f"You're pacing ₹{abs(diff):,} ({abs(pct)}%) OVER last month's spend. Reset the trajectory today — even one skipped order helps.",
                    'actions': [
                        {'label': 'Review budget',       'cta': 'open_budget'},
                        {'label': 'See biggest jump',    'cta': 'chat'},
                    ],
                    'deep_analysis': [f"Previous ₹{prev:,} · Current ₹{cur:,}"],
                    'priority': 'high' if abs(pct) >= 15 else 'med',
                }
            return {
                'insight': f"You're ₹{abs(diff):,} ({abs(pct)}%) UNDER last month. Lock the win — stash the diff into a goal this weekend.",
                'actions': [{'label': 'Add to goal', 'cta': 'open_goal'}],
                'deep_analysis': [f"Previous ₹{prev:,} · Current ₹{cur:,}"],
                'priority': 'low',
            }
        return {
            'insight': "Need at least one full previous month of data to show month-over-month. Keep logging daily — first comparison unlocks after day 30.",
            'actions': [{'label': 'Log expense', 'cta': 'open_expense'}],
            'deep_analysis': [],
            'priority': 'med',
        }
    # ───── goal_strategy — original ─────
    if mode == 'goal_strategy' and goals.get('count', 0) > 0:
        top = goals.get('topGoal') or {}
        remain = max(0, int(top.get('target', 0)) - int(top.get('saved', 0)))
        days = max(1, remain // 200) if remain else 0
        return {
            'insight': f"At ₹200/day you'll reach '{top.get('name','your top goal')}' in {days} days. Push to ₹275/day → finish in ~{max(1, remain // 275) if remain else 0}.",
            'actions': [
                {'label': 'Increase savings pace', 'cta': 'open_goal'},
                {'label': 'Set auto-save', 'cta': 'open_goal'},
            ],
            'deep_analysis': [],
            'priority': 'med',
        }
    # ───── waste_detector — find the single biggest cuttable category ─────
    if mode == 'waste_detector':
        cats = (tx.get('categories') or {})
        monthly = int(tx.get('monthlySpend') or 0)
        if cats and monthly > 0:
            top_cat = max(cats.items(), key=lambda x: float(x[1]))
            name, spent = top_cat[0], int(top_cat[1])
            pct = round((spent / monthly) * 100) if monthly else 0
            cut10 = int(spent * 0.1)
            annual = cut10 * 12
            return {
                'insight': f"{name} is {pct}% of your spend (₹{spent:,}). A 10% trim = ₹{cut10:,}/mo → ₹{annual:,}/year back in your pocket.",
                'actions': [
                    {'label': f'Cap {name} budget', 'cta': 'open_budget'},
                    {'label': 'See where it went', 'cta': 'open_expense'},
                    {'label': 'Ask AI for swap ideas', 'cta': 'chat'},
                ],
                'deep_analysis': [f"{name}: ₹{spent:,} ({pct}%)"],
                'priority': 'high' if pct >= 35 else 'med',
            }
    # ───── what_if — simulate a habit change ─────
    if mode == 'what_if':
        monthly = int(tx.get('monthlySpend') or 0)
        if monthly > 0:
            save10 = int(monthly * 0.1)
            yr_invested = save10 * 12 * 1.12  # 1-yr @ 12 % CAGR approx
            return {
                'insight': f"If you cut spend by just 10% (₹{save10:,}/mo) and invest it, in 12 months you're sitting on ≈ ₹{int(yr_invested):,}. Compounding does the rest.",
                'actions': [
                    {'label': 'Start a SIP goal', 'cta': 'open_goal'},
                    {'label': 'Tighten a budget',  'cta': 'open_budget'},
                ],
                'deep_analysis': [],
                'priority': 'med',
            }
    # ───── home_pulse — one-liner for the home hero ─────
    if mode == 'home_pulse':
        score = int((ctx.get('score') or {}).get('value') or 0)
        streak = int((ctx.get('streak') or {}).get('days') or 0)
        if insights.get('overspending'):
            return {
                'insight': f"Pulse is red — {insights['overspending'][0]}. One 2-min fix today still saves the month.",
                'actions': [{'label': 'Open budget', 'cta': 'open_budget'}],
                'deep_analysis': [],
                'priority': 'high',
            }
        if score >= 75:
            return {
                'insight': f"Score {score}/100. {count} txns logged, {streak}-day streak. You're compounding — don't break it.",
                'actions': [{'label': 'Keep streak alive', 'cta': 'open_expense'}],
                'deep_analysis': [],
                'priority': 'low',
            }
        return {
            'insight': f"Score {score}/100, {count} txns this month. One more action keeps momentum.",
            'actions': [
                {'label': 'Log today\'s expense', 'cta': 'open_expense'},
                {'label': 'Review budgets',        'cta': 'open_budget'},
            ],
            'deep_analysis': [],
            'priority': 'med',
        }
    # Generic default — still actionable.
    return {
        'insight': f"You've logged {count} txns totalling ₹{int(tx.get('monthlySpend', 0)):,}. One action today keeps your score climbing.",
        'actions': [
            {'label': "Log today's expense", 'cta': 'open_expense'},
            {'label': 'Check budgets', 'cta': 'open_budget'},
            {'label': 'Ask AI anything', 'cta': 'chat'},
        ],
        'deep_analysis': [],
        'priority': 'low',
    }


async def _call_llm(mode: str, prompt: Optional[str], ctx: Dict[str, Any], lang: str = 'en') -> Optional[Dict[str, Any]]:
    try:
        import os
        emergent_key = os.environ.get('EMERGENT_LLM_KEY')
        if not emergent_key or not LlmChat or not UserMessage:
            log.info("ai_context: LLM unavailable, using fallback")
            return None
        sys = SYSTEM_PROMPT + "\n" + (get_lang_instruction(lang) or '')
        chat = LlmChat(api_key=emergent_key, session_id=f"ctx-{mode}", system_message=sys).with_model('openai', 'gpt-5.2')
        payload = {
            'mode': mode,
            'intent': MODES.get(mode, ''),
            'user_prompt': prompt or '',
            'context': ctx,
        }
        raw = await safe_send(
            chat,
            UserMessage(text=json.dumps(payload, ensure_ascii=False)),
            timeout=12.0,
            label='ai_context_response',
        )
        if not raw:
            return None
        # Strip code fences if any
        raw = raw.strip()
        if raw.startswith('```'):
            raw = raw.strip('`')
            if raw.lower().startswith('json'):
                raw = raw[4:]
            raw = raw.strip()
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None
        # Minimum schema enforcement
        if not parsed.get('insight'):
            return None
        parsed.setdefault('actions', [])
        parsed.setdefault('deep_analysis', [])
        parsed.setdefault('priority', 'med')
        return parsed
    except Exception as exc:
        log.warning("ai_context_response LLM failed: %s", exc)
        return None


def _ctx_shard(ctx: Dict[str, Any]) -> str:
    """Tiny fingerprint of the bits that actually move the insight — keeps
    cache-key churn low while avoiding collisions when numbers swing."""
    try:
        tx = ctx.get('transactions') or {}
        bud = ctx.get('budgets') or {}
        g = ctx.get('goals') or {}
        insights = ctx.get('insights') or {}
        # Round spend/budget to nearest ₹500 bucket so small deltas re-use cache.
        spend_bucket = int(float(tx.get('monthlySpend') or 0) // 500)
        bud_used_bucket = int(float(bud.get('used') or 0) // 500)
        return f"c{tx.get('count', 0)}s{spend_bucket}b{bud_used_bucket}g{g.get('count', 0)}o{1 if insights.get('overspending') else 0}"
    except Exception:
        return 'x'


@api_router.post('/ai-coach/context-response')
async def ai_coach_context_response(req: CtxRequest, user_id: str = Depends(get_current_user)):
    ctx = req.context or {}
    lang = req.lang or 'en'
    mode = req.mode or 'free'

    # Cache key includes user + mode + lang + context-shard so different
    # data states get distinct cached answers.
    cache_key = f"ai_ctx:{user_id}:{mode}:{lang}:{_ctx_shard(ctx)}"

    async def regen():
        try:
            llm_out = await _call_llm(mode, req.prompt, ctx, lang)
            if llm_out:
                return llm_out
        except Exception as exc:
            log.warning("ai_context regen LLM failed: %s", exc)
        return _deterministic_fallback(mode, ctx)

    # Stale-while-revalidate via llm_cache (same machinery as other endpoints).
    try:
        data = await get_or_regen(
            key=cache_key,
            compute_fn=regen,
            ttl_fresh=120,          # 2-min freshness (insights shift fast)
            ttl_stale=7 * 86400,
            fallback=_deterministic_fallback(mode, ctx),
        )
    except Exception as exc:
        log.warning("ai_context get_or_regen failed: %s", exc)
        data = _deterministic_fallback(mode, ctx)
    if not isinstance(data, dict) or not data.get('insight'):
        data = _deterministic_fallback(mode, ctx)
    return {'ok': True, 'mode': mode, 'data': data}
