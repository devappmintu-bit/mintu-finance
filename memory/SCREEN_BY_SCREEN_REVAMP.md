# MINTU · Screen-by-Screen Revamp — Design Deliverable

**Goal:** Premium · Futuristic · Effortless · Addictive
**Constraints:** Light-only · Glassmorphic · 60 fps · Expo Go + native parity
**Canvas:** `#FAFAF9` · **Brand:** `#E84A0C` · **Font:** Inter (400/500/600/700/900)
**Author:** Main agent · **Date:** 01 May 2026

---

## 🎨 1. DESIGN SYSTEM OVERVIEW

### 1.1 What already works (KEEP)

The v3 adaptive theme engine in `utils/theme.ts` is already mature:

| Token family  | Status                                                    |
|---------------|-----------------------------------------------------------|
| `bg.*`        | 5 surfaces (primary/secondary/card/elevated/dark)         |
| `accent.*`    | Primary brand `#E84A0C` + light/dark + saffron/magenta    |
| `text.*`      | 5 levels (primary/secondary/muted/tertiary/inverse)       |
| `border.*`    | subtle/focus/card — semi-transparent ink                  |
| `shadow.*`    | primary/medium/strong — ready for elevation tokens        |
| `state.*`     | success/warning/danger — each w/ bg + border variants     |
| `GLASS`       | blur tints, frosted overlays                              |
| `GRADIENT`    | brand / success / premium gradients                       |
| `GLOW`        | accent glow tokens (used on tab bar)                      |
| `MOTION`      | duration/easing primitives (already used by Reanimated)   |

### 1.2 What's MISSING (ADD in Wave 5)

| New token family      | Purpose                                                  |
|-----------------------|----------------------------------------------------------|
| `ELEVATION.z0..z5`    | Consistent depth tiers for cards/sheets/modals           |
| `RADIUS.xs..2xl`      | 4/8/12/16/24/32 unified corner language                  |
| `SPACE.0..8`          | 0/4/8/12/16/20/24/32/48 — 8-pt grid enforcement          |
| `TYPE.display/title/body/caption/mono` | Display H0/H1/H2 + body + caption  |
| `PRESSURE`            | `activeScale: 0.96` + `activeOpacity: 0.85` standard     |
| `HAPTIC`              | `light/medium/heavy/success/warning` intent-named preset |

### 1.3 North-Star Principles (what every screen must do)

1. **ONE primary action per screen.** No screen has 3 CTAs competing.
2. **Progressive disclosure.** Above-the-fold = hero + ONE action. Deep details ≤ 2 taps away.
3. **Hierarchy by size, not by color.** Reserve color for status + brand.
4. **Glass over white, never over white.** BlurView tints sit on a gradient or image; plain white cards use shadow, not blur.
5. **Every tap gives feedback.** Visual (scale 0.96), haptic (selection), and sound-off.
6. **Skeleton > spinner.** If the UI shape is knowable, skeleton it; spinners are a last resort.
7. **Never block first paint on a network call.** Shape renders instantly, data fills in.
8. **Errors are inline, never global toasts** — except for destructive write failures.

---

## 🧱 2. COMPONENT LIBRARY (modernized)

### 2.1 Existing primitives (KEEP, polish)

| Component             | Status         | Polish action                                     |
|-----------------------|----------------|---------------------------------------------------|
| `NeonButton`          | ✅ good        | Add `loading` prop with inline spinner            |
| `PrimaryButton`       | ✅ good        | Add `trailing icon` slot for arrow CTAs           |
| `TapTile`             | ✅ good        | Add `glow` prop for premium chips                 |
| `GlassSheet`          | ✅ good        | Keep                                              |
| `ProgressRing`        | ✅ good        | Add `sparkline` variant for money-score           |
| `InsightCard`         | ✅ good        | Add `skeleton` internal state                     |
| `TintedGlassCard`     | ✅ good        | Keep — the workhorse                              |
| `EmptyState`          | ✅ good        | Add `illustration` slot (Lottie)                  |
| `Skeleton`            | ✅ good        | Add `variant="card" / "list" / "ring"` helpers    |
| `ThinkingDots`        | ✅ good        | Already used in AI Coach                          |
| `GlowPill`            | ✅ good        | Use as chip in filter rows                        |
| `SheetHeader`         | ✅ good        | Keep                                              |

### 2.2 NEW components to add (Wave 5.x)

| Component             | Spec                                                          |
|-----------------------|---------------------------------------------------------------|
| `HeroStatCard`        | Large glass card: icon + big number + sparkline + delta chip  |
| `MicroBarChart`       | 7-bar inline SVG chart for Home sparkline                     |
| `FloatingAIButton`    | Bottom-right FAB ("Ask Mintu") — pulses at idle, across app   |
| `GestureRadioGroup`   | Swipe-to-select chip row (budget category, time range)        |
| `MoneyNumber`         | Animated ₹-amount with `react-native-reanimated` count-up     |
| `SuccessBurst`        | Confetti + checkmark + sound-off haptic on write success      |
| `PrimaryCTARow`       | Sticky bottom CTA with safe-area awareness + keyboard avoid   |
| `ListSectionHeader`   | Uppercase 11 pt grey with optional action link on the right   |
| `QuickScanFAB`        | Multi-action FAB: add txn / photo receipt / split / goal      |
| `AvatarStack`         | Overlapping avatar circles for Split member previews          |

All new components must:
- Use `React.memo` + stable props
- Honor `SPACE.*` / `RADIUS.*` / `ELEVATION.*` tokens
- Be under 120 LOC

---

## 📱 3. SCREEN-BY-SCREEN REVAMP (Top 10 by impact)

For each: **Purpose · Current friction · Redesign · Micro-interactions · CTA · Before→After · Impl notes.**

### 🏠 3.1 HOME — `app/(tabs)/index.tsx`

**Purpose** · The daily pulse. User answers "how am I doing financially *right now*?" in ≤ 3 seconds.

**Current friction:**
- 15+ cards compete for attention; no clear hierarchy
- Money Score card, MTD spend card, Premium teaser, Alerts, News all vying for eyeballs
- No single "what should I do next" action

**Redesign** (stack from top):
1. **Greeting strip** (unchanged — already good: avatar + search + notif bell)
2. **HERO: Money Score Ring + Pulse** — full-width glass card, 180-pt ring with sparkline aura. Below: "₹23,450 saved this month · on pace for ₹85k" in large serif-display. ONE CTA: "See why" (opens /premium-reports).
3. **Today's Quick Actions strip** — 3 neon chips: `+ Add expense · Scan SMS · View budget`. Sticky horizontally scrolls for more.
4. **Adaptive Card** — ONE card that changes by context (9 AM: Morning Check-in · 6 PM: Dinner Budget · Weekend: Spending Recap). Replaces 5 current cards.
5. **Insights feed** — collapsed cards (Smart Alerts, Predictions, Leaderboard) as single-line "tap to expand" rows.
6. **News** — last (not above-the-fold)

**Micro-interactions:**
- Money Score ring **counts up** from 0 on mount via `withTiming` (800 ms ease-out-cubic)
- Quick-action chips have subtle `scale(0.96)` on press + light haptic
- Sparkline draws left-to-right over 400 ms using `stroke-dashoffset`
- Pull-to-refresh: custom animated logo that "breathes"

**CTA visibility:** ONE primary — "See why" under the score. Everything else is secondary ghost/text links.

**Before → After:**
| Metric                | Before              | After              |
|-----------------------|---------------------|--------------------|
| Cards above fold      | 4 (competing)       | 1 (hero + chips)   |
| Visible CTAs          | 7                   | 1 primary + 3 chips|
| Time-to-understanding | ~8s                 | ~3s                |
| First-paint calls     | 5                   | 1 (`/home/bundle`) |

**Impl notes:**
- Replace `BalanceHero + MoneyScoreCard + QuickActionBar + TodayChips` with new `HomeHero` component (≤ 150 LOC)
- Use `@shopify/flash-list` for the collapsed-card feed
- Reuse `/home/bundle` (already shipped)

---

### 💸 3.2 TRANSACTIONS — `app/(tabs)/transactions.tsx`

**Purpose** · Ledger of truth. Fast read, fast edit, fast delete.

**Current friction:**
- Good smart-grouping already exists (Today/Yesterday/Week/Month — shipped Phase 3)
- Filter row and search are OK but not instantly discoverable
- Swipe-to-delete works but has no preview

**Redesign:**
1. **Collapsible sticky header** — big amount total for the current view ("₹12,450 this month, 23 txns"). Collapses to 48 pt on scroll.
2. **Always-visible search pill** + **3 time-range chips** (7D · 30D · All) · **1 filter icon** opens bottom sheet
3. **Smart-grouped list** (keep) — each group header shows group total in light grey
4. **Row design** — 56pt rows · category emoji (36 pt circle) · title + merchant + amount · faint divider. Swipe left reveals Edit + Delete in saffron/crimson.
5. **Floating + FAB** (bottom-right) — multi-action: quick cash · scan SMS · upload receipt
6. **Undo snackbar** on delete — 5 s undo with shake-subtle animation

**Micro-interactions:**
- Swipe actions use `react-native-gesture-handler` with rubber-band resistance
- Amount numbers use `MoneyNumber` with count-up on filter change
- Tapping a row fades in a bottom sheet (no hard navigation)
- Smooth 300 ms cross-fade when group collapses/expands

**CTA visibility:** Primary = FAB (+). Secondary = swipe actions (discoverable via small hint arrow on first app session).

**Impl notes:**
- `FlashList` with `getItemType` (header vs row) — already good
- Add `QuickScanFAB` from new library
- Add `SuccessBurst` on add-expense

---

### 🧑‍🤝‍🧑 3.3 SPLIT — `app/(tabs)/split.tsx`

**Purpose** · Settle money with friends without awkward money-talk.

**Current friction:**
- 889 LOC — a single giant file (TECH DEBT)
- Balance summary, group cards, settlement rows all in one component tree
- First-time users see empty state but no "how does this work?"

**Redesign:**
1. **Hero: You owe / You're owed** — single glass strip with two stat cards side-by-side. Net number hero-sized. Tap to see breakdown modal.
2. **Group cards carousel** — horizontal scroll (new UX for mobile-first). Each card: group emoji, name, net position (you owe ₹X / owes you ₹Y), avatar stack of members (max 3 + "+2").
3. **"Recent activity" section** — last 5 settlements + new expenses across all groups
4. **Smart suggestion card** — "Settle with Rahul today (owes you ₹1,200)" with direct UPI deep-link CTA
5. **Empty state (first-use)** — Lottie animation of two people splitting a pizza + "Create your first group"

**Micro-interactions:**
- Group cards snap to center on scroll end (deck-like)
- Settle button has a subtle haptic + checkmark burst + confetti
- Avatar stack has overlap reveal — stagger-fade in 80 ms each

**CTA visibility:** Primary = "Settle now" in suggestion card. Secondary = "+" to add new expense.

**Impl notes:**
- **Extract sub-components** (overdue refactor): `GroupCard`, `BalanceHero`, `SettlementRow`, `GroupMembersList`, `SettlementSuggestionCard` — drops main file from 889 → ~180 LOC
- Use the new `AvatarStack` component
- Existing `SmartSettleSheet` stays

---

### 📊 3.4 BUDGET — `app/(tabs)/budget.tsx`

**Purpose** · Check limits at a glance, catch overspending before it happens.

**Current friction:**
- Category cards are horizontal but not all visible
- Progress bars feel mechanical
- No clear "what to do next" for overspent categories

**Redesign:**
1. **Radial monthly health ring** — center of screen shows overall % used (e.g. "67% of ₹40k"). Ring color shifts from emerald → saffron → crimson as it fills.
2. **Category grid** — 2x3 grid of tiles (was list). Each tile: emoji, category, progress micro-bar, "₹X / ₹Y" below. Tap opens `BudgetSmartSheet`.
3. **Over-budget banner** — sticky at top when any category exceeds 90% — "Food is 110% used. Pause or raise?"
4. **Insights row** — "🎯 You're trending 8% under last month" — data viz chip
5. **Floating "Edit Budgets" button** — secondary action, subtle

**Micro-interactions:**
- Ring color interpolates live via `useAnimatedStyle`
- Tiles have 300 ms entry stagger (top-left first)
- Over-budget banner has a slight left-right shake (0.3° wobble, 2 cycles) to signal urgency without being annoying

**CTA visibility:** Primary = "Pause category" (when over-budget banner active). Secondary = "Edit Budgets".

**Impl notes:**
- Replace horizontal ScrollView with `FlashList numColumns={2}` for masonry grid
- Add animated ring with `react-native-svg` + `withTiming`
- Keep `BudgetSmartSheet` as-is (already 799 LOC and well-isolated)

---

### 🤖 3.5 AI COACH — `app/(tabs)/ai-coach.tsx`

**Purpose** · Talk to a smart friend about money. Get answers, not lectures.

**Current friction:**
- 4 tabs (Insights · Tax · Invest · School) with locked tabs visible
- Insights tab has big scrollable feed but feels like a dashboard, not a chat
- "Ask Mintu" button is hidden in header — low CTA visibility

**Redesign:**
1. **Promote "Ask" to primary action** — full-width pill below the greeting: "Ask Mintu anything about your money →". Pulses brand-orange when idle.
2. **Below that, 3 suggested quick-prompts** chips: "Where did my money go this week?" · "Can I afford this?" · "Best tax regime for me?" — tap → opens chat pre-filled.
3. **Tabs go under quick-prompts, smaller** — tax, invest, school icons as round tiles (not locked tabs). Tapping opens a fullscreen tool, not a sub-tab.
4. **Insights feed below** — snackable cards: "Top 3 money moves this week" · "1 subscription drain detected" · "You're 78% through your Food budget"

**Micro-interactions:**
- Ask pill has a subtle shimmer gradient animation (3 s loop) when idle
- Quick-prompt chips scale-up on press, then slide up into chat modal
- Insights cards arrive with a 400 ms staggered fade + slight y-translate
- Mintu avatar bobs gently when the typing indicator is on

**CTA visibility:** ONE primary — the Ask pill. Everything else orbits it.

**Impl notes:**
- Keep `AICoachChat` modal
- New top-level component `AskMintuPill` (≤ 60 LOC)
- Use existing `FloatingAIButton` concept across app (not just in this tab)

---

### 👤 3.6 PROFILE — `app/(tabs)/profile.tsx`

**Purpose** · Identity hub · progress snapshot · settings drawer.

**Current friction:**
- Already heavily revamped in Phase 3 (Identity Hub + Progress Engine) — mostly good
- Settings list is long (Financial / Preferences / Support / Account) — takes 2 swipes to find "Delete account"

**Redesign (refinements only):**
1. **Identity card unchanged** (already gorgeous)
2. **Progress chips row** — streak · badges · rewards — already good, add click-to-expand micro-animation
3. **"Inner circle" section NEW** — referrals / invite friends / family plan — pulls social actions out of Financial
4. **Collapsible settings groups** — tap "Preferences" → expands inline (no nav). Reduces page length by 60%.
5. **Logout + Delete account** at the very bottom, grey type, separated by extra spacing — clear that these are destructive

**Micro-interactions:**
- Collapsible groups use `LayoutAnimation.easeInEaseOut` (300 ms)
- Avatar edit: tap shows a subtle bloom + "Change photo" hint
- Weekly win card share: tap triggers half-modal with preview + share sheet

**CTA visibility:** Primary = Avatar edit (implicit). Secondary = Achievements/Leaderboard chips.

**Impl notes:**
- Already memoized (Phase 5 Wave 2A) ✅
- Add `Accordion` primitive (new component, ~80 LOC)

---

### 🎁 3.7 REWARDS — `app/(tabs)/rewards.tsx`

**Purpose** · The dopamine loop. Spin, earn, redeem.

**Current friction:**
- Spin wheel is fun but card hierarchy afterwards is unclear
- Coin balance / streak / achievements all in one wall

**Redesign:**
1. **Hero spin wheel** — centered, bigger, with particle burst on win
2. **Coin balance strip** — directly under wheel, format: "4,280 🪙 +120 today" + mini button "Ledger"
3. **Streak meter** — segmented bar showing weekly streak (M T W T F S S) — missed day = grey, current = glowing
4. **Rewards catalog** — grid of 2-col tiles: coffee coupon, movie ticket, amazon voucher. Price in coins. Redeem = lock with animation.
5. **Daily missions** — 3-chip row: "Log txn · 50 🪙", "Open app · 10 🪙", "Check budget · 25 🪙". Completed = checkmark burst.

**Micro-interactions:**
- Spin wheel: Reanimated rotation w/ overshoot + deceleration. Particle burst via `@shopify/react-native-skia` particle system (optional)
- Coin count animates up (MoneyNumber component) when reward claimed
- Streak meter pulses the "today" segment
- Mission complete: confetti + haptic + sound-off

**CTA visibility:** Primary = "Spin now" on wheel (if spins available). Secondary = Redeem tiles.

**Impl notes:**
- Existing wheel component stays
- New `StreakMeter`, `RewardTile`, `MissionChip` components

---

### 🔓 3.8 UNLOCK — `app/unlock.tsx`

**Purpose** · Fast, delightful re-entry. First impression on every session.

**Current friction:**
- 575 LOC — heavy
- PIN pad is functional but plain

**Redesign:**
1. **Animated Mintu mascot** — greets with a wave. Context-aware: "Good morning, Sid" / "Welcome back"
2. **PIN pad** — round glass buttons, 72-pt, with subtle press-down scale + faint haptic per digit
3. **Biometric tile** — prominent face-ID icon, "Use Face ID" button. Default action on supported devices.
4. **Glyph-only error feedback** — wrong PIN = 3 quick shakes + dots turn crimson for 800 ms. NO toast.

**Micro-interactions:**
- PIN dots fill with a tiny ink-pop as each digit enters
- Wrong PIN: `withSequence(shake) + error haptic`
- Success: logo pulse + fade to home
- Biometric icon has a slow breathing pulse at idle

**CTA visibility:** Biometric (if available) > PIN pad > "Forgot PIN" text-link.

**Impl notes:**
- Refactor PIN dots into memoized sub-component
- Keep biometric branch

---

### 🎯 3.9 GOALS — `app/goals.tsx`

**Purpose** · Long-term financial aspirations with visible progress.

**Current friction:**
- Already improved with ProgressRings (Phase 3)
- List view is good but lacks "what's next"

**Redesign:**
1. **Top impact card** — "You're 3 weeks ahead on your Europe Trip goal! 🎉". Dynamic, based on fastest-moving goal.
2. **Goal card** — glass, 120-pt tall. Left: circle ring (animated). Right: title, target ₹, current ₹, days left, inline progress chip (+8% this month).
3. **Long-press card** to reveal contribute/edit/archive actions (iOS-style menu)
4. **+ Add goal** sticky CTA at bottom (safe-area aware)
5. **Achievement burst** — on reaching 100%: full-screen Lottie celebration

**Micro-interactions:**
- Ring draws on card mount (staggered 100 ms per card)
- Contribute action: number count-up + ring fill animation
- Goal completion: Konfetti + mascot victory pose

**Impl notes:**
- Reuse shared `ProgressRing` (already built)
- New `GoalCard` component + long-press gesture

---

### 💎 3.10 PREMIUM HUB — `app/premium-hub.tsx`

**Purpose** · Discover premium features, convert to paid.

**Current friction:**
- 6 feature cards all equal weight — no clear "hook"
- Three of these cards linked to dead routes (FIXED in Phase 7)

**Redesign:**
1. **Hero: current plan chip + one-line value-prop** ("You're saving ₹450/mo with Premium · or upgrade now to unlock 3 new tools")
2. **Feature stack (vertical, one scroll page per card) "Tinder" model**:
   - One feature at a time, full-width, big icon + 3-line pitch + "Try it now" CTA
   - Swipe up for next feature
3. **Social proof strip** between cards: "27k Indians saving with MintU · ⭐ 4.8 rating"
4. **Sticky bottom: "Upgrade for ₹99/mo" button** — only visible on Free tier

**Micro-interactions:**
- Features "card stack" uses `react-native-deck-swiper` or similar gesture
- Upgrade button has a subtle glow pulse every 10s (polite, not spammy)

**CTA visibility:** Primary = "Upgrade" sticky · Secondary = per-feature "Try it now"

**Impl notes:**
- Replace grid layout with deck-swiper
- Current 6 static cards → paginated full-width features

---

## 🎬 4. INTERACTION & ANIMATION SPECS

### 4.1 Motion vocabulary

| Motion                | Duration  | Easing                     | Use                         |
|-----------------------|-----------|----------------------------|-----------------------------|
| Micro-feedback press  | 100 ms    | `ease-out`                 | Button scale 1→0.96→1       |
| Card reveal           | 300 ms    | `ease-out-cubic`           | New card entry              |
| Page transition       | 350 ms    | `ease-in-out-quad`         | Stack navigator             |
| Hero count-up         | 800 ms    | `ease-out-quart`           | Money numbers, percentiles  |
| Success burst         | 1200 ms   | `ease-out-bounce`          | Goal hit, payment sent      |
| Sheet slide           | 320 ms    | `spring(damping=14)`       | Bottom sheets               |
| Skeleton shimmer      | 1500 ms loop | `linear`                | Loading state               |

### 4.2 Haptic intent map

| Intent            | Platform      | Gesture                                    |
|-------------------|---------------|--------------------------------------------|
| `selection`       | Light tick    | Tab switch, chip select                    |
| `impactLight`     | Soft tap      | Button press                               |
| `impactMedium`    | Firm tap      | Destructive confirm (delete, logout)       |
| `impactHeavy`     | Thud          | Reward unlock, achievement                 |
| `notifSuccess`    | Success chord | Write success (add txn, pay settle)        |
| `notifWarning`    | Warn buzz     | Over-budget banner appears                 |
| `notifError`      | Error buzz    | Write failure, wrong PIN                   |

### 4.3 Loading states

- **Skeleton first** (always)
- **Spinner only** when skeleton shape is unknowable
- **Progress bar** for multi-step (Gmail sync, photo upload)
- Never `<ActivityIndicator size="large" />` on a blank screen for > 500ms

### 4.4 Error states

- **Inline error chip** in the card where the error lives
- **Toast only** for write failures (destructive actions that went wrong)
- **Full-screen error boundary** only for crashes — not for 500s from an API

---

## 📐 5. BEFORE vs AFTER — PROJECTED METRICS

| Metric                                  | Before         | After         |
|-----------------------------------------|----------------|---------------|
| Home time-to-understanding              | ~8 s           | ~3 s          |
| Cards competing above fold              | 4-7            | 1 hero + 3    |
| Primary CTAs per screen                 | 3-5 (avg)      | 1 (enforced)  |
| First-paint latency (mid-tier Android)  | 1.5-2 s        | 700 ms-1 s    |
| Perceived "app is broken" toasts        | 1-2/session    | 0             |
| Accessibility (screen-reader friendly)  | Partial        | Full          |
| Scroll depth on home before action      | 3 screens      | 0.5 screen    |

---

## 🛠️ 6. DEV IMPL NOTES (React Native / Expo-friendly)

### 6.1 Libraries to ADD (Wave 5.x)

| Library                         | Purpose                          | Size impact |
|---------------------------------|----------------------------------|-------------|
| `@shopify/react-native-skia`    | Particle bursts, custom charts   | +3 MB       |
| `lottie-react-native`           | Animated illustrations           | +2 MB (already ships tooling) |
| `react-native-deck-swiper`      | Premium hub card stack           | +200 KB     |
| `react-native-haptic-feedback` or use existing `expo-haptics` | Haptic intents | 0 MB (already) |

### 6.2 Libraries already available (USE)

- `react-native-reanimated` ✅ — for all 60-fps animations
- `react-native-gesture-handler` ✅ — for swipe actions
- `@shopify/flash-list` ✅ — for all lists > 10 items
- `expo-haptics` ✅ — for haptic intent
- `expo-linear-gradient` ✅ — for hero cards

### 6.3 File-layout strategy

```
components/
  primitives/        ← NEW: HeroStatCard, MoneyNumber, MicroBarChart, PrimaryCTARow
  home/              ← NEW: HomeHero (replaces MoneyScoreCard+BalanceHero)
  split/             ← REFACTOR: extract GroupCard, BalanceHero, SettlementRow, AvatarStack
  budget/            ← NEW: BudgetRadialHealth, CategoryTile
  rewards/           ← NEW: StreakMeter, MissionChip, RewardTile
  goals/             ← NEW: GoalCard with long-press menu
  profile/           ← existing, add Accordion primitive
```

### 6.4 Performance budget per screen

- **First paint:** ≤ 700 ms (on mid-tier Android, warm cache)
- **60 fps scroll** on all lists ≥ 100 rows (FlashList enforced)
- **Under 100 child re-renders** per state tick (verified via React Profiler)
- **Route transition:** 300-400 ms (Expo Router default)

### 6.5 Order of implementation (recommended)

1. **Wave 5.0 — Design System additions** (SPACE/RADIUS/ELEVATION tokens + new primitives · 2 days)
2. **Wave 5.1 — Home Hero revamp** (highest visibility · 1 day)
3. **Wave 5.2 — Split refactor + new cards** (tech debt + UX · 2 days)
4. **Wave 5.3 — Budget radial health + grid tiles** (1 day)
5. **Wave 5.4 — AI Coach "Ask pill" promotion** (0.5 day)
6. **Wave 5.5 — Rewards visual polish + StreakMeter** (1 day)
7. **Wave 5.6 — Goals card + long-press menu** (0.5 day)
8. **Wave 5.7 — Unlock mascot + PIN pad polish** (0.5 day)
9. **Wave 5.8 — Premium Hub card stack** (1 day)
10. **Wave 5.9 — Transactions FAB + undo snackbar** (0.5 day)

**Total:** ~10 working days for the full pass.

---

## 🔥 7. WHY USERS WILL LOVE IT

**Home tab** — "I get it instantly. One number, one action, no noise."
**Transactions** — "Swipe. Done. Gone. It feels like muscle memory."
**Split** — "Card deck for my groups. Fun, not a spreadsheet."
**Budget** — "The ring is emerald. I'm winning this month."
**AI Coach** — "One big button. I just ask. It answers."
**Rewards** — "Spin, get coins, redeem coffee. Addictive."
**Profile** — "My identity, my progress, my controls. Mine."
**Goals** — "Europe in 47 days. The ring is 78% full. Let's go."
**Premium** — "Swipe through features. No pressure. Clear value."
**Unlock** — "Face ID. I'm in in < 1 second. Mascot waves."

Each screen answers the one question:
**"Why would a user LOVE using this?"**

---

## 🏁 THIS IS A SPEC, NOT A PR

This document is the **blueprint**. Implementing all 10 screens = ~10 working days of focused work.

**Recommendation:** start with **Wave 5.1 (Home Hero revamp)** — highest visibility, lowest risk, sets the design language for everything else. If you approve that result, we proceed sequentially through the list.

Pick 1-3 screens to prioritize and I'll ship them in the next round.
