"""
CLI entry-point for the simulation engine.

Usage:
  python -m simulation.runner --n 100
  python -m simulation.runner --n 1000 --concurrency 50 --no-cleanup

Runs from the backend container so it shares MONGO_URL / EMERGENT_LLM_KEY.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv


def main() -> None:
    # Bootstrap env (so MONGO_URL / EMERGENT_LLM_KEY are visible).
    backend_dir = Path(__file__).parent.parent
    sys.path.insert(0, str(backend_dir))
    load_dotenv(backend_dir / ".env")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s :: %(message)s",
    )

    p = argparse.ArgumentParser()
    p.add_argument("--n", type=int, default=50, help="persona count")
    p.add_argument("--concurrency", type=int, default=30)
    p.add_argument("--base-url", default="http://localhost:8001")
    p.add_argument("--chaos-budget", type=int, default=100)
    p.add_argument("--no-cleanup", action="store_true")
    p.add_argument("--run-id", default=None)
    args = p.parse_args()

    from simulation.engine import run_simulation

    js = asyncio.run(run_simulation(
        n=args.n, concurrency=args.concurrency,
        base_url=args.base_url, chaos_budget=args.chaos_budget,
        cleanup=not args.no_cleanup, run_id=args.run_id,
    ))

    o = js["overall"]
    print()
    print(f"✓ Sim {js['run_id']} complete in {o['duration_s']}s")
    print(f"  {o['total_steps']} API calls · {o['overall_error_rate'] * 100:.1f}% error rate")
    print(f"  Report: /app/sim_reports/sim_{js['run_id']}.md")
    print(f"  JSON  : /app/sim_reports/sim_{js['run_id']}.json")


if __name__ == "__main__":
    main()
