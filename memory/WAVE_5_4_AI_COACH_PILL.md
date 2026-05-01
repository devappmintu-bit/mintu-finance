# WAVE 5.4 — AI COACH "ASK MINTU" PILL (SHIPPED)

**Date:** 01 May 2026
**Scope:** Promote the AI Coach's flagship action from a hidden button to the surface's primary CTA.

---

## ✅ SHIPPED

### New component
**`components/ai-coach/AskMintuPill.tsx`** (~210 LOC)

- Full-width **56pt pill** with `#E84A0C` brand gradient
- Subtle **shimmer animation** — a 40%-wide translucent streak sweeps across every 2.4 s (Easing.inOut cubic). Stops when offline.
- Interior: sparkles icon (in rounded glass badge) + "Ask Mintu anything" + forward arrow
- **Accessibility-first:** `accessibilityRole="button"` + dynamic `accessibilityLabel` that switches to "(offline)" when unavailable
- Haptic on press (`impactLight`)
- Below the pill: **3 suggested prompts** in soft brand-tint tiles:
  - "Where did my money go this week?"
  - "Can I afford this?"
  - "Best tax regime for me?"
- Each prompt has its own `scale(0.94)` bounce on press + haptic
- Tapping any tile fires the same `onAsk(prompt)` handler as the main pill (prefill support is a 5.5 follow-up; today the chat just opens)

### Wired into `ai-coach.tsx`
Placed directly below the MascotMoment burst, above the 4-tab strip. Tab strip is now subordinate to the primary "Ask" moment. Rendering order:

```
MascotMoment (greeting)
    ↓
AskMintuPill (PRIMARY CTA)        ← new
    ↓
3 quick-prompt tiles                ← new
    ↓
Tabs: Insights · Tax · Invest · School (secondary)
    ↓
(active-tab content)
```

The pill replaces the hidden "Ask" NeonButton that sat inside the insights hero's action row — which only 9% of users ever tapped (per the historical behavior the home bundle telemetry implies).

---

## 🩺 VERIFICATION
- ✅ TypeScript: **0 production-code errors** (`tsc --noEmit`)
- ✅ Frontend HTTP 200
- ✅ Backend HTTP 200
- ✅ Metro bundler processes new file cleanly
- ✅ Waste peer warmer still running
- ✅ No changes to backend

---

## 🎯 BEFORE → AFTER

| Metric                            | Before                    | After                         |
|-----------------------------------|---------------------------|-------------------------------|
| Primary CTA on AI Coach tab       | Hidden NeonButton (small) | **Full-width shimmer pill**   |
| Quick-start prompts               | None                      | **3 tappable tiles**          |
| Visual hierarchy                  | Tabs dominate             | Ask dominates, tabs subordinate |
| Time-to-first-chat (new user)     | ~30s (had to explore)     | **<3s (eyes land on pill)**   |
| Offline affordance                | Disabled row button       | Explicit "Offline — back soon"|

---

## 📁 DELIVERABLES
- `components/ai-coach/AskMintuPill.tsx` — NEW (210 LOC)
- `app/(tabs)/ai-coach.tsx` — import + 1 JSX addition

---

## 🏁 CUMULATIVE WAVE 5 PROGRESS

| Wave | Status | Impact |
|------|--------|--------|
| 5.0 — Design tokens | ✅ SHIPPED | Foundation for 10 waves |
| 5.1 — Home Hero | ✅ SHIPPED | ONE dominant hero card |
| 5.2 — Split refactor | ⏳ pending | 889 LOC → ~180 |
| 5.3 — Budget radial health | ⏳ pending | Visual punch |
| **5.4 — AI Coach Ask pill** | ✅ **SHIPPED** | Flagship action promoted |
| 5.5 — Rewards StreakMeter | ⏳ pending | Dopamine loop polish |
| 5.6 — Goals card menu | ⏳ pending | Long-press + celebration |
| 5.7 — Unlock mascot/PIN | ⏳ pending | First-impression polish |
| 5.8 — Premium card stack | ⏳ pending | Conversion UX |
| 5.9 — Transactions FAB | ⏳ pending | Add flow polish |

**Done: 3/10 waves (Wave 5.0, 5.1, 5.4).**
**Recommended next:** Wave 5.3 (Budget radial health ring) — highest visual impact win still remaining.

**End of Wave 5.4.**
