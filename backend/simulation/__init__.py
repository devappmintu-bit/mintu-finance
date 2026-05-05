"""
MintU Full-Spectrum User Simulation Engine — Round 93.

Spins up N synthetic users (default 1k), drives them through realistic
behaviour patterns based on persona archetype, and surfaces friction
points, drop-offs and bugs that human QA misses.

Design:
  • httpx async client hits real /api endpoints — real bugs, not mocks.
  • Phone prefix `99` + `_synthetic:true` flag for sandbox isolation.
  • Hybrid driver: scripted state-machine + LLM at decision branches.
  • Reports written to /app/sim_reports/ (Markdown + JSON).
  • Cleanup is mandatory at run-end — leak-free by design.
"""
from .engine import run_simulation
from .personas import build_personas, FinancialBehaviour

__all__ = ["run_simulation", "build_personas", "FinancialBehaviour"]
