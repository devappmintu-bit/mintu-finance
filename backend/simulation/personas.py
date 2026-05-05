"""
Persona generation — financial behaviour archetypes × demographics.

Each persona is a *deterministic seed* derived from `persona_id` so
identical seeds yield identical users — letting us A/B test changes
against a stable population baseline across builds.

Reality bias:
  • 8 financial-behaviour archetypes, weighted to match real Indian app
    distributions (savers ~ 18%, overspenders ~ 22%, avoiders ~ 25%, etc).
  • Income distribution is log-normal anchored at ₹45k median
    (CMIE-ish, urban-skewed since MintU is mobile-first).
  • 30% Tier-1, 40% Tier-2, 25% Tier-3, 5% rural — reflecting current
    PFM acquisition mix.
"""
from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass, asdict, field
from enum import Enum
from typing import Any


class FinancialBehaviour(str, Enum):
    SAVER = "saver"
    OVERSPENDER = "overspender"
    INVESTOR = "investor"
    AVOIDER = "avoider"
    IMPULSIVE = "impulsive_buyer"
    DEBT_TRAPPED = "debt_trapped"
    MINIMALIST = "minimalist"
    OPTIMIZER = "wealth_optimizer"


BEHAVIOUR_WEIGHTS = {
    FinancialBehaviour.SAVER: 0.18,
    FinancialBehaviour.OVERSPENDER: 0.22,
    FinancialBehaviour.INVESTOR: 0.06,
    FinancialBehaviour.AVOIDER: 0.25,
    FinancialBehaviour.IMPULSIVE: 0.15,
    FinancialBehaviour.DEBT_TRAPPED: 0.07,
    FinancialBehaviour.MINIMALIST: 0.04,
    FinancialBehaviour.OPTIMIZER: 0.03,
}

CITY_TIERS = [
    ("tier1", 0.30, ["Mumbai", "Bangalore", "Delhi", "Chennai", "Hyderabad", "Pune"]),
    ("tier2", 0.40, ["Jaipur", "Lucknow", "Indore", "Kochi", "Nagpur", "Bhopal", "Patna"]),
    ("tier3", 0.25, ["Mysore", "Aurangabad", "Hubli", "Solapur", "Vellore", "Trichy"]),
    ("rural", 0.05, ["Wardha", "Sangli", "Karad", "Bidar"]),
]

PROFESSIONS = [
    ("student", 0.12, (0, 15000)),
    ("salaried_jr", 0.30, (25000, 80000)),
    ("salaried_sr", 0.20, (80000, 300000)),
    ("freelancer", 0.12, (15000, 200000)),
    ("business_owner", 0.10, (40000, 1500000)),
    ("unemployed", 0.06, (0, 10000)),
    ("homemaker", 0.05, (0, 30000)),
    ("gig_worker", 0.05, (10000, 50000)),
]


@dataclass
class Persona:
    persona_id: str
    name: str
    phone: str
    age: int
    city: str
    tier: str
    profession: str
    income_monthly: int
    behaviour: FinancialBehaviour
    risk_appetite: float            # 0..1; 0=averse, 1=YOLO
    consistency: float              # 0..1; 0=chaotic, 1=disciplined
    digital_savvy: float            # 0..1; affects success on multi-step flows
    languages: list[str]            # primary first
    traits: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["behaviour"] = self.behaviour.value
        return d


def _seeded_rng(seed: str) -> random.Random:
    h = hashlib.sha256(seed.encode()).digest()
    return random.Random(int.from_bytes(h[:8], "big"))


def _weighted_pick(rng: random.Random, choices: list[tuple]) -> tuple:
    """choices = [(value, weight, *extras), ...]; returns the full tuple."""
    total = sum(c[1] for c in choices)
    pick = rng.random() * total
    cum = 0.0
    for c in choices:
        cum += c[1]
        if pick <= cum:
            return c
    return choices[-1]


def _phone_for(persona_id: str) -> str:
    """Synthetic phone — prefixed `99` so they're distinguishable from
    real users in admin tooling. Numeric tail derived from persona_id
    hash to keep them deterministic across runs."""
    h = hashlib.md5(persona_id.encode()).hexdigest()
    tail = int(h[:8], 16) % 100_000_000
    return f"99{tail:08d}"   # always 10 digits, starts with 99


FIRST_NAMES = [
    "Aarav", "Aditi", "Riya", "Kabir", "Aanya", "Vivaan", "Sneha", "Rohan",
    "Ishaan", "Diya", "Arjun", "Pari", "Aryan", "Saanvi", "Krishna", "Anika",
    "Reyansh", "Aadhya", "Vihaan", "Myra", "Sai", "Kiara", "Atharv", "Ira",
]
LAST_NAMES = [
    "Sharma", "Patel", "Kumar", "Singh", "Gupta", "Reddy", "Iyer", "Menon",
    "Joshi", "Pillai", "Nair", "Khan", "Verma", "Bose", "Roy", "Das",
]


def _build_persona(persona_id: str, run_id: str) -> Persona:
    rng = _seeded_rng(f"{run_id}::{persona_id}")

    # 1. Behaviour archetype — weighted draw.
    bvals = list(BEHAVIOUR_WEIGHTS.items())
    behaviour = _weighted_pick(rng, [(b, w) for b, w in bvals])[0]

    # 2. Demographics.
    tier_pick = _weighted_pick(rng, CITY_TIERS)
    tier_name, _, cities = tier_pick
    city = rng.choice(cities)

    prof_pick = _weighted_pick(rng, PROFESSIONS)
    profession, _, (inc_lo, inc_hi) = prof_pick
    # Log-normal income within bracket
    if inc_hi > inc_lo:
        income = int(math.exp(rng.uniform(math.log(max(inc_lo, 1)), math.log(inc_hi))))
    else:
        income = inc_lo

    age = max(18, min(70, int(rng.gauss(33, 11))))
    name = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"

    # 3. Psychological dials — partly correlated with behaviour.
    risk_base = {
        FinancialBehaviour.SAVER: 0.20,
        FinancialBehaviour.OVERSPENDER: 0.55,
        FinancialBehaviour.INVESTOR: 0.65,
        FinancialBehaviour.AVOIDER: 0.30,
        FinancialBehaviour.IMPULSIVE: 0.75,
        FinancialBehaviour.DEBT_TRAPPED: 0.45,
        FinancialBehaviour.MINIMALIST: 0.25,
        FinancialBehaviour.OPTIMIZER: 0.50,
    }[behaviour]
    risk_appetite = max(0.0, min(1.0, rng.gauss(risk_base, 0.15)))

    consistency_base = {
        FinancialBehaviour.SAVER: 0.75,
        FinancialBehaviour.OVERSPENDER: 0.30,
        FinancialBehaviour.INVESTOR: 0.80,
        FinancialBehaviour.AVOIDER: 0.15,
        FinancialBehaviour.IMPULSIVE: 0.25,
        FinancialBehaviour.DEBT_TRAPPED: 0.40,
        FinancialBehaviour.MINIMALIST: 0.85,
        FinancialBehaviour.OPTIMIZER: 0.90,
    }[behaviour]
    consistency = max(0.0, min(1.0, rng.gauss(consistency_base, 0.15)))

    digital_savvy = max(0.0, min(1.0, rng.gauss(
        0.85 if tier_name == "tier1" else 0.65 if tier_name == "tier2" else 0.45 if tier_name == "tier3" else 0.30,
        0.15,
    )))

    langs = ["en"] if tier_name == "tier1" or rng.random() < 0.3 else rng.choice([["hi", "en"], ["ta", "en"], ["te", "en"], ["mr", "en"]])

    return Persona(
        persona_id=persona_id,
        name=name,
        phone=_phone_for(persona_id),
        age=age,
        city=city,
        tier=tier_name,
        profession=profession,
        income_monthly=income,
        behaviour=behaviour,
        risk_appetite=risk_appetite,
        consistency=consistency,
        digital_savvy=digital_savvy,
        languages=langs,
        traits={
            "forgets_decimals": rng.random() < 0.3,
            "double_taps": rng.random() < 0.18,
            "abandons_mid_flow": rng.random() < 0.22,
            "reads_alerts": rng.random() < 0.4,
        },
    )


def build_personas(n: int, run_id: str) -> list[Persona]:
    """Materialise N persona records for `run_id`. Deterministic."""
    return [_build_persona(f"sim_{run_id}_{i:06d}", run_id) for i in range(n)]


__all__ = ["build_personas", "FinancialBehaviour", "Persona", "BEHAVIOUR_WEIGHTS"]
