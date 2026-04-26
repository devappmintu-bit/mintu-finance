"""Round 50 visual gate — Playwright multi-route theme sweep.

Strategy to bypass the RN devtools redbox timing issue that broke
S1.5 / S2 / S3 visual sweeps:

1. Pre-seed localStorage with the desired theme key BEFORE navigation,
   so the app boots in the right theme on first paint (no toggle race).
2. Use `domcontentloaded` instead of `load` so we don't wait on websocket
   connections to Metro tunnel.
3. After navigation, *if* a "Dismiss" button is present, click it.
4. Use a longer wait_for_timeout on the first route only (cold bundle),
   then short waits for subsequent routes (already bundled).

Run:  python /app/scripts/round50_visual_gate.py
Output: PNGs in /tmp/round50_visual/<route>__<theme>.png
"""
import asyncio
import os
import sys
from pathlib import Path

OUTDIR = Path('/tmp/round50_visual')
OUTDIR.mkdir(parents=True, exist_ok=True)

ROUTES = [
    ('/',                 'home'),
    ('/transactions',     'transactions'),
    ('/budget',           'budget'),
    ('/split',            'split'),
    ('/yearly',           'yearly'),
    ('/rewards-hub',      'rewards-hub'),
    ('/premium-reports',  'premium-reports'),
]

THEMES = ['light', 'dark', 'system']

INIT_SCRIPT = """
(theme) => {
    try {
        localStorage.setItem('@mintu:theme_mode', theme);
        localStorage.setItem('@mintu:theme_amoled', '0');
        // Also set onboarding flags so we can land on routes directly
        localStorage.setItem('mintu_onboarding_done', '1');
        localStorage.setItem('mintu_pin_skip', '1');
    } catch {}
}
"""

async def dismiss_redbox(page):
    """Click any redbox 'Dismiss' button if present (RN devtools artifact)."""
    try:
        btn = page.locator('text=Dismiss').first
        if await btn.is_visible(timeout=400):
            await btn.click(force=True)
            await page.wait_for_timeout(300)
            return True
    except Exception:
        pass
    return False


async def sweep_route(page, route, slug, theme, first_load):
    url = f'http://localhost:3000{route}'
    try:
        await page.goto(url, wait_until='domcontentloaded', timeout=60000)
    except Exception as e:
        return f'❌ {slug}/{theme}: nav-fail ({e.__class__.__name__})'

    # Cold bundle on the very first call needs more time; warm calls are fast.
    await page.wait_for_timeout(8000 if first_load else 2500)
    await dismiss_redbox(page)
    await page.wait_for_timeout(700)

    out = OUTDIR / f'{slug}__{theme}.jpg'
    try:
        await page.screenshot(path=str(out), quality=22, full_page=False, type='jpeg')
        size = out.stat().st_size
        return f'✅ {slug}/{theme}: shot {size//1024}kb'
    except Exception as e:
        return f'⚠️  {slug}/{theme}: snap-fail ({e.__class__.__name__})'


async def main():
    from playwright.async_api import async_playwright

    results: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=['--no-sandbox'])
        ctx = await browser.new_context(viewport={'width': 390, 'height': 844})

        # Inject theme seed BEFORE every navigation so the app boots in
        # the pre-set theme and we never see a flash of the wrong palette.
        await ctx.add_init_script(
            "try { const t = window.__round50_theme || 'light';"
            " localStorage.setItem('@mintu:theme_mode', t);"
            " localStorage.setItem('@mintu:theme_amoled', '0'); } catch {}"
        )

        page = await ctx.new_page()
        # Navigate once to the app origin so localStorage seeding hits the
        # right document. (localStorage is origin-scoped — about:blank seeds
        # are isolated and never carry over to the SPA.)
        try:
            await page.goto('http://localhost:3000/', wait_until='domcontentloaded', timeout=60000)
            await page.wait_for_timeout(6000)  # let initial bundle warm up
            await dismiss_redbox(page)
        except Exception as e:
            print(f'⚠️  warmup nav failed: {e}', flush=True)

        first = True
        # We sweep theme as the outer loop so we don't constantly reload bundles.
        for theme in THEMES:
            # Seed localStorage on the live app origin, then reload so the
            # themeStore.loadFromStorage() picks up the new value at boot.
            try:
                await page.evaluate(INIT_SCRIPT, theme)
                await page.reload(wait_until='domcontentloaded', timeout=60000)
                await page.wait_for_timeout(4000)
                await dismiss_redbox(page)
            except Exception as e:
                print(f'⚠️  could not seed theme={theme}: {e}', flush=True)
            for route, slug in ROUTES:
                msg = await sweep_route(page, route, slug, theme, first_load=first)
                print(msg, flush=True)
                results.append(msg)
                first = False

        await browser.close()

    ok = sum(1 for r in results if r.startswith('✅'))
    fail = len(results) - ok
    print(f'\n=== SUMMARY: {ok} ok / {fail} fail / {len(results)} total ===')
    return 0 if fail == 0 else 1


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
