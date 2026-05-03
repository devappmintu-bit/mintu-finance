# 🔍 MintU Codebase Audit — Round 75
*Generated: 2026-05-02*

This is the **persistent audit document** referenced by the
"Preserve what works. Eliminate what doesn't. Align everything else."
mandate. Future rounds use this as the authoritative checklist.

---

## ✅ Round 75 — Phase 1 Audit Results

### A. File counts
- `frontend/`: **283** TypeScript files (.tsx/.ts, excluding node_modules)
- `frontend/components/`: 235 candidate files
- `backend/routers/`: ~40 router files

### B. Confirmed Duplicates (audit pass)
| Pair | Status | Round |
|------|--------|-------|
| `Confetti.tsx` vs `ConfettiBurst.tsx` | ✅ MERGED — burst deleted | R75 |
| `AskMintuPill.tsx` (orphan) | ✅ DELETED — replaced by AskBar | R75 |
| `Mascot.tsx` vs `MintuMascot.tsx` | 🟡 Both alive — different APIs (small vs animated). Could merge with a `variant` prop. | TBD |
| `MascotMoment.tsx` (3 usages) vs `MascotErrorState.tsx` (2 usages) | 🟡 Both alive, different domains. Acceptable. | – |

### C. Confirmed Dead Code (deleted R75)
| File | Size | Reason |
|------|------|--------|
| `components/ConfettiBurst.tsx` | 3.4 KB | superseded by `Confetti.tsx` |
| `components/ai-coach/AskMintuPill.tsx` | 6.6 KB | superseded by `ai-coach/AskBar.tsx` (R71) |
| `utils/messageDedup.ts` | 3.2 KB | zero references in codebase |
| **TOTAL** | **13.2 KB** | |

### D. Likely Dead but Kept (low cost, possible future use)
- `utils/version.ts` (0.5 KB) — exports `APP_VERSION` constant, no current importers. Useful scaffolding; keeping.

### E. Anti-Patterns Found (defer to future rounds)
| Issue | Count | Risk |
|-------|-------|------|
| Direct `import api` in components | **35 files** | Should route through `services/*` for type safety + unified error handling |
| Hardcoded padding/radius in StyleSheet | **~567 occurrences** | Should snap to `theme.SPACE` / `theme.RADIUS` tokens |
| Mixed `useSwr` + raw `api.get` in same screen | ~10 files | Single fetch strategy preferred |

### F. Round 70 / 74 fixes still holding
- LLM cache regen worker thread isolation: ✅ healthy
- News.py inline-regen removal: ✅ /api/home/bundle 17–24ms (was 27 s)
- Cache warmup loop: ✅ running every 30 min

### G. Backend routes count
- `/api/*` total endpoints: ~140 across routers
- `/api/news/india-finance` latency post-R74: **15-21 ms** (was 25 000 ms)

---

## 🎯 Future Round Backlog (priority-ordered)

### Phase 2A — Unified Input System (HIGH leverage)
**Goal**: One sheet primitive for AddTransaction / AddBudget / AddGoal / AddSplit
**Files**: `components/transactions/TransactionSheet.tsx`, `components/budget/BudgetSmartSheet.tsx`, `components/goals/GoalSheet.tsx`, `app/split/add-expense.tsx`
**Win**: 4 different mental models → 1; ~400 LOC duplicate logic removed; consistent UX
**Risk**: Medium — touches 4 high-traffic flows; requires testing

### Phase 2D — Typed Data Layer (MEDIUM leverage)
**Goal**: Move 35 direct `api` imports in components into typed services (`services/transactions.ts`, `services/splits.ts` etc.)
**Files**: 35 components
**Win**: type safety, single error handler, easier refactors
**Risk**: Low — purely mechanical refactor

### Phase 2B — Design Token Sweep (LOW leverage, high consistency)
**Goal**: Replace 567 hardcoded values with theme tokens
**Files**: ~80 components
**Win**: visual consistency, dark-mode-readiness
**Risk**: Low (mechanical) but tedious

### Phase 2C — Context-Aware Mascot (MEDIUM leverage, fun)
**Goal**: Mascot reacts to user state (just paid → confetti, budget breached → concerned)
**Files**: `components/Mascot.tsx`, new `hooks/useMascotState.ts`
**Win**: Rule 6 satisfaction, delight
**Risk**: Low

### Phase 4 — Setu/OneMoney AA Integration (BLOCKED on API keys)
**Goal**: Auto-fetch user's bank transactions
**Risk**: External dependency; needs sandbox key from user

---

## 🚫 Anti-Patterns to NOT Reintroduce
- ❌ `asyncio.create_task` from inside FastAPI request handler (Starlette anyio TaskGroup adopts the task → blocks response). Use thread-isolated workers (see `core/llm_cache.py`).
- ❌ `Alert.alert` for confirmation dialogs (replaced with bottom sheets).
- ❌ Multiple AI entry points on the same screen (R71).
- ❌ Hardcoded color hex inside StyleSheet (use `COLORS.*`).
- ❌ Direct `localStorage.setItem` (use `AsyncStorage`).
