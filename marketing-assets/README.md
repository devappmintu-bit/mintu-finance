# MintU — Marketing Assets

Auto-generated App Store / Play Store screenshots, captured from the
production static export of the MintU app on a freshly-seeded test
account (`9876543210` / OTP `123456`).

## Files

```
iphone/                                 — 430×932 logical (App Store 6.7" tier)
  01_landing_hero.png                   public landing — hero, kicker
  02_landing_capture.png                public landing — email + JOIN block
  03_landing_features.png               public landing — feature grid
  04_landing_trust.png                  public landing — trust panel
  05_home.png                           authenticated home — Pulse / GE / mood
  06_transactions.png                   transactions — month spend, insights
  07_ai_coach.png                       AI Coach — greeting + contextual chips
  08_pulse.png                          Money Pulse — feed + categories
  09_insights_full_report.png           R118 full report — mood/projected/recap
  10_split.png                          Split — net balance, groups, AI readout

android/                                — 393×851 logical (Pixel 7 class)
  same set as iphone/, re-rendered at Android device width
```

## Usage

### App Store Connect
- Drop `iphone/*.png` into the **6.7"** screenshot tier (iPhone 16 Pro
  Max, 15 Pro Max, 14 Pro Max, 13 Pro Max).
- For the smaller required tiers (5.5" / 6.5"), re-run the capture
  script with the relevant viewport — see `scripts/capture_marketing.md`.

### Play Console
- Drop `android/*.png` into the **Phone** screenshot bucket. Play
  accepts 1080×1920+ in either orientation; these are 393×851 at 3x =
  1179×2553, which is within tolerance.

### Re-generation
Run from main agent context:
```bash
sudo supervisorctl restart static_web
# then call mcp_screenshot_tool with the /app/scripts/capture_marketing.py
```

## What's NOT here (and why)
- **Hero video / App Preview**: requires motion design + video editing
  outside this environment. Out of scope until a video team is briefed.
- **5.5"/6.5" iPhone**: only 6.7" generated to keep this round shippable
  in one pass. Add additional viewports as needed.
- **Tablet (12.9" iPad)**: same reasoning. App is `supportsTablet: true`
  but optimised for phone first.

## Captions (suggested)

Pair each screenshot with a one-line headline + two-line subtitle
when uploading to the stores:

| File | Headline | Subtitle |
| ---- | -------- | -------- |
| 01_landing_hero | Money, simplified. | Real-time SMS intelligence. No spreadsheets. No LLM rewriting your numbers. |
| 05_home | Your money, at a glance. | Mood Score, Pulse, and the next thing to do — all on one screen. |
| 06_transactions | Every rupee, accounted for. | Categorised, deduplicated, scored for confidence — automatically. |
| 07_ai_coach | A coach that knows your money. | Grounded answers, with sources. Never hallucinates your balance. |
| 08_pulse | Money news that actually matters. | A swipeable feed of signals that change your decisions. |
| 09_insights_full_report | The story of your month. | Five panels: mood, projection, behaviour, peers, recap. |
| 10_split | Settle without spreadsheets. | Friends don't need a MintU account to chip in. |

— R120
