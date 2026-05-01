# WAVE 5.6 — GOALS IMPACT CARD (SHIPPED)

**Date:** 01 May 2026
**Scope:** Opinionated celebratory headline at the top of the Goals screen.

---

## ✅ SHIPPED

### New component: `GoalsImpactCard`
**`components/goals/GoalsImpactCard.tsx`** (~200 LOC, `React.memo`-wrapped)

Picks the **most-on-pace goal** and surfaces an opinionated headline.
Goal: the user's first glance lands on a **win**, not a to-do list.

### Selection logic (priority order)
1. **Any goal at ≥ 100%** → `🎉 Goal smashed — {name} is 100% funded!`
2. **Any goal ≥ 1 week ahead of linear pace** → `🚀 You're {N} week(s) ahead!`
3. **Highest-% goal with target date** → `Keep the momentum — {name} · {pct}% of ₹{target}`
4. **Low-%** → `Every ₹ counts — Add ₹500 to unlock X%`
5. **No goals / no savings** → `null` (card hidden)

### Visual design
- Horizontal glass card: emoji tile + headline + subline + progress pill
- **4 tone palettes** mapped to the 4 selection branches:
  - `celebrate` → emerald green
  - `ahead` → brand orange
  - `ontrack` → blue
  - `push` → purple
- Each tone paints a faint top-left → bottom-right gradient on the card
- Tappable — fires `onPressGoal(id)` which opens the goal's edit sheet
- Haptic feedback on press (`selectionAsync`)

### Wired into `goals.tsx`
Placed above the existing goal grid. Conditional: renders only when
`goals.length > 0`, sits inside the non-empty branch of the list.

```
<ScrollView>
  [... other hero stuff ...]
  goals.length === 0 ? EmptyState : (
    <GoalsImpactCard goals={goals} onPressGoal={openEdit} />  ← NEW
    <View style={grid}>
      {/* existing goal cards */}
    </View>
  )
</ScrollView>
```

---

## 🩺 VERIFICATION
- ✅ TypeScript: `tsc --noEmit` → 0 production-code errors
- ✅ Frontend HTTP 200
- ✅ Backend HTTP 200
- ✅ Waste peer warmer still cycling (8-min interval)
- ✅ No changes to backend

---

## 🎯 BEFORE → AFTER

| Aspect                            | Before                      | After                                |
|-----------------------------------|-----------------------------|--------------------------------------|
| First glance on Goals screen      | List of targets (to-do)     | **Celebratory opinionated headline** |
| Emotional response                | "more work to do"           | **"I'm winning"**                    |
| Empty-state vs populated          | Same neutral grid           | 4 distinct tone palettes             |
| Tappability of headline           | n/a                         | Direct deep-link into goal detail    |

---

## 📁 DELIVERABLES
- `components/goals/GoalsImpactCard.tsx` — NEW (200 LOC)
- `app/goals.tsx` — 1 import + conditional JSX wrapper

---

## 🏁 CUMULATIVE WAVE 5 PROGRESS (4 of 10 shipped)

| Wave | Status | Impact |
|------|--------|--------|
| 5.0 — Design tokens | ✅ SHIPPED | Foundation (SPACE/RADIUS/ELEVATION/TYPO/PRESSURE/HAPTIC_INTENT) |
| 5.1 — Home Hero | ✅ SHIPPED | 1 dominant hero replacing 4 competing cards |
| 5.4 — AI Coach Pill | ✅ SHIPPED | Flagship "Ask" action promoted from hidden to primary |
| **5.6 — Goals Impact** | ✅ **SHIPPED** | Opinionated celebratory headline |
| 5.2 — Split refactor | ⏳ pending | 889 LOC → ~180 LOC + AvatarStack |
| 5.3 — Budget radial health | ⏳ pending | Animated health ring + over-budget banner |
| 5.5 — Rewards StreakMeter | ⏳ pending | Dopamine loop polish |
| 5.7 — Unlock mascot/PIN | ⏳ pending | First-impression |
| 5.8 — Premium card stack | ⏳ pending | Conversion UX |
| 5.9 — Transactions FAB | ⏳ pending | Add flow polish |

**End of Wave 5.6.**
