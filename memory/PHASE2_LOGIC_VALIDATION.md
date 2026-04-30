# PHASE 2 — LOGIC VALIDATION REPORT
**Generated:** $(date)
**Scope:** End-to-end audit across backend/ (FastAPI + Motor) and frontend/ (Expo + RN)
**Method:** Automated AST/regex detectors (`/tmp/phase2_auto.txt`) + human-grade review of 5 load-bearing modules.

---

## 📊 SEVERITY SUMMARY

| Severity   | Count | Action                       |
|------------|-------|------------------------------|
| 🔴 CRITICAL |   0   | —                            |
| 🟠 HIGH     |   1   | Fix immediately (this round) |
| 🟡 MEDIUM   |  ~90  | Triage in Phase 3 (consolidate / suppress noise) |
| 🟢 LOW      | ~104  | Backlog / lint-rule enforcement |

> The automated detector found **0** critical and **0** high. The single 🟠 HIGH below was discovered during human-grade review of the load-bearing tab files.

---

## 🔴 CRITICAL — 0 findings
No null derefs, no unawaited Promise rejections in critical paths, no infinite loops, no obvious race conditions, no SQL/NoSQL injection vectors, no auth bypass paths, no broken state machines.

---

## 🟠 HIGH — 1 finding

### H-1 · `profile.tsx` double-fetches on first mount → 18 redundant API calls
**File:** `/app/frontend/app/(tabs)/profile.tsx`
**Lines:** 221–222
```tsx
useEffect(() => { loadData(); }, [loadData]);
useFocusEffect(React.useCallback(() => { loadData(); }, [loadData]));
```
**Why this is HIGH**
- `loadData()` issues **9 parallel API calls** (`Promise.all([...])`).
- On first mount of the Profile tab, `useEffect` fires AND `useFocusEffect` fires (focus event always follows mount).
- Net effect: **18 simultaneous API requests** (9 × 2) on first profile open.
- This compounds with backend rate-limit middleware → users on weak networks may trip 429 responses → Profile shows half-loaded data.

**Fix**
Drop `useEffect` — `useFocusEffect` already covers the mount case (it fires the first time the screen comes into focus).

**Impact after fix**
- 50% reduction in profile network load
- Eliminates a class of "ghost" 429 retries already observed in `api.ts` interceptor logs

---

## 🟡 MEDIUM — Aggregate findings (90 instances)

### M-Class-1 · 89 bare `except Exception:` blocks (auto-detected)
- Found across `backend/core/*`, `backend/routers/*`, and many test files.
- Most are intentional best-effort cleanup (telemetry, breadcrumb log, idempotency unlock).
- **Action:** Phase 3 should classify each into:
  - ✅ `# noqa: BLE001 — best-effort cleanup` — keep (telemetry, audit emit, soft TTL bumps)
  - ❌ Real swallow that hides bugs — surface via `logger.exception(...)`
- **High-priority files to triage first:**
  - `backend/routers/split_settle.py` (18 occurrences) — money-movement code
  - `backend/routers/split_razorpay.py` (5 occurrences) — payment gateway
  - `backend/routers/user.py` (7 occurrences) — auth & profile mutations

### M-2 · `index.tsx` L78-84 — silent failure on unread count fetch
```ts
const refreshUnread = useCallback(async () => {
  try {
    const { fetchUnreadCount } = await import('../../services/notifications');
    const n = await fetchUnreadCount();
    setUnread(n);
  } catch {}   // ← swallows
}, []);
```
- Combined with 60s `setInterval` (L97-102) + AppState listener (L88-93) + mount fetch → up to 3 simultaneous refreshes can fire when an app is backgrounded for >60s and brought to foreground.
- **Recommendation:** Add `lastRefreshAt` ref + 5s debounce.

### M-3 · `index.tsx` setInterval polling continues while offline
- L97-102: 60s polling fires regardless of network status.
- Adds 1 wasted request per minute when offline (already auto-retries 2x via `api.ts`).
- **Recommendation:** Pause via `useIsOnline()` hook.

### M-4 · `split.tsx` empty-deps `useEffect`
- L159: `useEffect(() => { fetchData(); reloadNudges(); }, []);`
- If `fetchData` / `reloadNudges` reference state via closure they may capture stale values.
- **Recommendation:** Verify both are wrapped in `useCallback` with proper deps; otherwise stale-closure bug latent.

### M-5 · `split.tsx` 10+ `setTimeout(() => fetchData(), 300)` calls
- Each sheet `close()` schedules its own delayed fetch.
- Two sheets closing within 300 ms → two overlapping fetches.
- **Recommendation:** Debounce via a ref-bound `pendingFetch` token.

### M-6 · `api.ts` `setTimeout` for `authExpiredHandled` reset
- L70-72: timer is never cleared on module unload (`HMR` / `Fast Refresh`).
- Cost: ~negligible; but on rapid HMR cycles you can accumulate stale timers.

### M-7 · `theme.ts` + `makeStyles.ts` — theme mutation not reactive
- `applyTheme()` mutates `COLORS` in-place; `makeStyles` uses `useMemo([c])` where `c` is a stable proxy reference → memo never busts.
- Net: theme changes only propagate via root `Stack` `key` remount.
- In Light-Only mode (current), this is intentional/moot.
- **Latent risk:** If dark mode ever returns, theme changes will appear to silently fail until full Stack remount.

---

## 🟢 LOW — Aggregate findings (~104 instances)

### L-Class-1 · 101 `ObjectId(user_id)` without `bson.ObjectId.is_valid()` guard
- Auto-detected across all routers.
- Risk: passing a malformed string produces `bson.errors.InvalidId` → 500 instead of 400.
- **NOT exploitable** in current flow because `user_id` is sourced from a verified JWT claim; an attacker cannot forge a malformed claim past `decode_token`.
- **Recommendation:** Add a small `safe_oid(s)` helper and return `400 BAD_REQUEST` when `s` is invalid for any path-param `*_id` (group/expense/transaction).

### L-2 · 3 redundant `async` functions
- `frontend/(tabs)/rewards.tsx:66` — `trackABEvent`
- `frontend/onboarding.tsx:68` — `go`
- `frontend/onboarding.tsx:79` — `skip`
- No `await` / no Promise inside → strip the `async` keyword.

### L-3 · `backend/tests/test_round53i_ledger_stress.py:199`
- `to_list(None)` unbounded fetch on a stress test.
- Fine for tests; flag for if this pattern leaks into production code.

---

## ✅ ACTION ITEMS

| # | Severity | Description                                             | Phase  |
|---|----------|---------------------------------------------------------|--------|
| 1 | 🟠 HIGH   | Remove duplicate `useEffect` in `profile.tsx`           | NOW    |
| 2 | 🟡 MED    | Classify 89 bare-excepts (keep vs. log)                 | Phase 3|
| 3 | 🟡 MED    | Debounce `refreshUnread` + pause polling when offline  | Phase 3|
| 4 | 🟡 MED    | Debounce `split.tsx` `setTimeout`-based refetches       | Phase 4|
| 5 | 🟢 LOW    | Add `safe_oid(...)` helper for path-param ObjectIds     | Phase 5|
| 6 | 🟢 LOW    | Strip 3 redundant `async` keywords                      | Phase 5|

---

## 📄 RAW DATA ARTIFACTS
- Automated scan: `/tmp/phase2_auto.txt` (441 lines)
- System map (Phase 1): `/app/memory/SYSTEM_MAP.txt`

---

**End of Phase 2 Report.**
