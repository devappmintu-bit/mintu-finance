"""One-off script to generate a mascot-style adaptive app icon for MintU
using OpenAI gpt-image-1 via the Emergent LLM key.

Run from /app:
    /root/.venv/bin/python /app/scripts/generate_mascot_icon.py

Outputs:
    /app/frontend/assets/images/icon.png            (1024×1024)
    /app/frontend/assets/images/adaptive-icon.png   (1024×1024 — same image)
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from backend dir (where EMERGENT_LLM_KEY lives)
BACKEND = Path("/app/backend")
load_dotenv(BACKEND / ".env")

from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration  # noqa: E402

OUT_DIR = Path("/app/frontend/assets/images")

# Carefully crafted prompt for a mobile-first mascot icon.
PROMPT = (
    "A high-quality 3D-rendered mascot character icon for a personal "
    "finance mobile app. Single centered character: a friendly cute cartoon "
    "fox with big round eyes, smiling warmly, holding a small gold coin in "
    "one paw. The fox has a stylized tie around its neck (mint-green color) "
    "to suggest a finance/business theme. Soft Pixar-Disney 3D style with "
    "smooth gradients, subtle ambient occlusion, and a crisp clean look. "
    "Background: a vibrant rounded-square gradient from a warm orange (#F56E1E) "
    "at top-left to deep coral at bottom-right, no text or letters anywhere. "
    "The fox occupies the center 70% of the canvas, with comfortable padding "
    "on all sides for safe-zone cropping in Android adaptive icons. Bold, "
    "high-contrast silhouette so it reads clearly even at 40×40 pixels. "
    "Square 1:1 aspect ratio, designed as a premium iOS and Android app icon "
    "(Apple Wallet / Notion / Stripe level polish)."
)


async def main() -> int:
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        print("❌ EMERGENT_LLM_KEY missing in /app/backend/.env", file=sys.stderr)
        return 2

    print("→ Generating mascot icon via OpenAI gpt-image-1 …")
    gen = OpenAIImageGeneration(api_key=api_key)
    images = await gen.generate_images(
        prompt=PROMPT,
        model="gpt-image-1",
        number_of_images=1,
    )
    if not images:
        print("❌ No images returned", file=sys.stderr)
        return 3

    image_bytes = images[0]
    if not isinstance(image_bytes, (bytes, bytearray)) or len(image_bytes) < 1024:
        print(f"❌ Bad image payload (type={type(image_bytes)}, len={len(image_bytes) if hasattr(image_bytes,'__len__') else '?'})", file=sys.stderr)
        return 4

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    icon_path = OUT_DIR / "icon.png"
    adaptive_path = OUT_DIR / "adaptive-icon.png"
    icon_path.write_bytes(image_bytes)
    adaptive_path.write_bytes(image_bytes)
    print(f"✅ Wrote {icon_path} ({len(image_bytes):,} bytes)")
    print(f"✅ Wrote {adaptive_path} ({len(image_bytes):,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
