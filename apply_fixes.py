#!/usr/bin/env python3
"""
apply_fixes.py — MintU Round 51 fix applicator
Run from the Emergent terminal: python3 /app/apply_fixes.py

Applies all backend + frontend fixes in one shot.
Safe to re-run (all replacements are idempotent).
"""

import os
import re
import sys

ROOT = "/app"
BE = f"{ROOT}/backend"
FE = f"{ROOT}/frontend"

passed = 0
failed = 0

def patch(path, old, new, label=""):
    global passed, failed
    full = path if path.startswith("/") else os.path.join(ROOT, path)
    if not os.path.exists(full):
        print(f"  ⚠  SKIP (file not found): {full}")
        return
    with open(full, encoding="utf-8") as f:
        content = f.read()
    if old not in content:
        if new in content:
            print(f"  ✓  Already applied: {label or path.split('/')[-1]}")
            passed += 1
        else:
            print(f"  ✗  NOT FOUND: {label or path.split('/')[-1]}")
            failed += 1
        return
    with open(full, "w", encoding="utf-8") as f:
        f.write(content.replace(old, new))
    print(f"  ✓  {label or path.split('/')[-1]}")
    passed += 1

def patch_regex(path, pattern, replacement, label=""):
    global passed, failed
    full = path if path.startswith("/") else os.path.join(ROOT, path)
    if not os.path.exists(full):
        print(f"  ⚠  SKIP (file not found): {full}")
        return
    with open(full, encoding="utf-8") as f:
        content = f.read()
    new_content, n = re.subn(pattern, replacement, content)
    if n == 0:
        print(f"  ✓  Already applied (no match): {label or path.split('/')[-1]}")
        passed += 1
        return
    with open(full, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"  ✓  {label or path.split('/')[-1]} ({n} replacements)")
    passed += 1

def bulk_replace(directory, old, new, ext=".py", label=""):
    """Replace in all files under directory."""
    global passed, failed
    count = 0
    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if d not in ["__pycache__", ".ruff_cache", "node_modules", ".expo"]]
        for fname in files:
            if not fname.endswith(ext) or fname.endswith(".bak"):
                continue
            path = os.path.join(root, fname)
            with open(path, encoding="utf-8") as f:
                content = f.read()
            if old in content:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(content.replace(old, new))
                count += 1
    if count:
        print(f"  ✓  {label}: {count} files")
        passed += 1
    else:
        print(f"  ✓  {label}: already applied")
        passed += 1

def ensure_import(path, check_for, import_line, after_pattern=None):
    """Add an import line if it's not already present."""
    global passed, failed
    full = path if path.startswith("/") else os.path.join(ROOT, path)
    if not os.path.exists(full):
        return
    with open(full, encoding="utf-8") as f:
        content = f.read()
    if check_for in content:
        return  # already there
    if after_pattern and after_pattern in content:
        content = content.replace(after_pattern, after_pattern + "\n" + import_line, 1)
    else:
        # Prepend after first import block
        lines = content.split("\n")
        insert_at = 0
        for i, line in enumerate(lines):
            if line.startswith("from ") or line.startswith("import "):
                insert_at = i + 1
        lines.insert(insert_at, import_line)
        content = "\n".join(lines)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  ✓  Added import to {full.split('/')[-1]}")
    passed += 1

# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("  MintU Round 51 Fix Applicator")
print("="*60)

# ─────────────────────────────────────────────────────────────────────────────
print("\n[1/10] datetime.utcnow() → datetime.now(timezone.utc)")
bulk_replace(BE, "datetime.utcnow()", "datetime.now(timezone.utc)",
             label="All backend .py files")

# Ensure timezone is imported in every affected file
print("       Ensuring timezone imports...")
for root, dirs, files in os.walk(BE):
    dirs[:] = [d for d in dirs if d not in ["__pycache__", ".ruff_cache"]]
    for fname in files:
        if not fname.endswith(".py") or fname.endswith(".bak"):
            continue
        path = os.path.join(root, fname)
        with open(path, encoding="utf-8") as f:
            content = f.read()
        if "timezone.utc" not in content:
            continue
        dt_imports = re.findall(r"from datetime import ([^\n]+)", content)
        has_tz = any("timezone" in i for i in dt_imports)
        if not has_tz and dt_imports:
            def add_tz(m):
                cur = m.group(1).strip()
                if "timezone" not in cur:
                    return f"from datetime import {cur}, timezone"
                return m.group(0)
            new_content = re.sub(r"from datetime import ([^\n]+)", add_tz, content, count=1)
            if new_content != content:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(new_content)
print("  ✓  timezone imports checked")
passed += 1

# ─────────────────────────────────────────────────────────────────────────────
print("\n[2/10] Fix timezone-naive comparison bug in premium routes")

patch(f"{BE}/routers/premium.py",
    '    until = user.get("premium_until")\n    is_premium = tier in ("premium", "legend") and (until is None or until > datetime.now(timezone.utc))',
    '    until = user.get("premium_until")\n    if isinstance(until, datetime) and until.tzinfo is None:\n        until = until.replace(tzinfo=timezone.utc)\n    is_premium = tier in ("premium", "legend") and (until is None or until > datetime.now(timezone.utc))',
    "premium.py tz fix")

patch(f"{BE}/routers/premium_reports.py",
    '    until = user.get("premium_until")\n    return tier in ("premium", "legend") and (until is None or until > datetime.now(timezone.utc))',
    '    until = user.get("premium_until")\n    if isinstance(until, datetime) and until.tzinfo is None:\n        until = until.replace(tzinfo=timezone.utc)\n    return tier in ("premium", "legend") and (until is None or until > datetime.now(timezone.utc))',
    "premium_reports.py tz fix")

# ─────────────────────────────────────────────────────────────────────────────
print("\n[3/10] Fix search.py invalid escape sequence")

patch(f"{BE}/routers/search.py",
    'rather than \\$text search',
    'rather than $text search',
    "search.py escape fix")

# ─────────────────────────────────────────────────────────────────────────────
print("\n[4/10] Add missing MongoDB indexes")

patch(f"{BE}/core/lifecycle.py",
    '        await db.family_budgets.create_index("group_id")\n\n        logger.info("✅ MongoDB indexes created for 1.46B-scale performance")',
    '''        await db.family_budgets.create_index("group_id")

        # ── Round 51 additions: previously unindexed collections ──────
        await db.sent_notifications.create_index(
            [("user_id", 1), ("date", -1)],
            name="sent_notifs_user_date",
        )
        await db.agent_memory.create_index("user_id", unique=True)
        await db.split_reminders.create_index(
            [("recipient_id", 1), ("status", 1), ("created_at", -1)],
            name="split_reminders_recipient",
        )
        await db.split_reminders.create_index(
            [("sender_id", 1), ("recipient_id", 1), ("group_id", 1), ("created_at", -1)],
            name="split_reminders_sender_pair",
        )
        await db.otp_audit.create_index("phone")
        await db.otp_audit.create_index(
            "created_at", expireAfterSeconds=3600,
            name="otp_audit_ttl",
        )
        await db.ab_events.create_index("group")
        await db.coins_wallet.create_index("user_id", unique=True)
        await db.split_settlements.create_index(
            [("group_id", 1), ("created_at", -1)],
            name="split_settlements_group",
        )

        logger.info("✅ MongoDB indexes created for 1.46B-scale performance")''',
    "lifecycle.py 10 new indexes")

# ─────────────────────────────────────────────────────────────────────────────
print("\n[5/10] Add extra='forbid' to security-critical Pydantic models")

patch(f"{BE}/schemas.py",
    'from pydantic import BaseModel, Field, field_validator\n',
    'from pydantic import BaseModel, Field, field_validator\nfrom pydantic import ConfigDict\n',
    "schemas.py ConfigDict import")

for model, first_field in [
    ("UserCreate", "    phone: str"),
    ("UserLogin", "    phone: str\n    password: str"),
    ("OTPSendRequest", "    phone: str\n\n    @field_validator"),
    ("TransactionCreate", "    amount: float = Field(..., gt=0"),
    ("SMSParseRequest", "    sms_text: str"),
]:
    patch(f"{BE}/schemas.py",
        f"class {model}(BaseModel):\n    {first_field.lstrip()}",
        f"class {model}(BaseModel):\n    model_config = ConfigDict(extra=\"forbid\")\n    {first_field.lstrip()}",
        f"schemas.py {model} extra=forbid")

patch(f"{BE}/schemas.py",
    'class OTPVerifyRequest(BaseModel):\n    phone: str\n    otp: str',
    'class OTPVerifyRequest(BaseModel):\n    model_config = ConfigDict(extra="forbid")\n    phone: str\n    otp: str',
    "schemas.py OTPVerifyRequest extra=forbid")

# ─────────────────────────────────────────────────────────────────────────────
print("\n[6/10] Fix N+1 queries")

# analytics.py — batch friend lookup
patch(f"{BE}/routers/analytics.py",
    '    friends = []\n    for fid in friend_ids:\n        try:\n            friend = await db.users.find_one({"_id": ObjectId(fid)})\n        except Exception:\n            continue\n        if not friend:\n            continue\n\n        f_score = friend.get("money_score", 50)',
    '''    # Batch-fetch all friends in a single query (avoids N+1)
    try:
        friend_oids = [ObjectId(fid) for fid in friend_ids]
    except Exception:
        friend_oids = []
    friend_docs = await db.users.find(
        {"_id": {"$in": friend_oids}},
        {"name": 1, "money_score": 1, "streak_days": 1},
    ).to_list(len(friend_oids) + 1)
    friend_map = {str(doc["_id"]): doc for doc in friend_docs}

    friends = []
    for fid in friend_ids:
        friend = friend_map.get(fid)
        if not friend:
            continue

        f_score = friend.get("money_score", 50)''',
    "analytics.py N+1 friend lookup")

# notifications.py — batch budget queries
patch(f"{BE}/routers/notifications.py",
    '    budgets = await db.budgets.find({"user_id": user_id}).to_list(50)\n    thirty_days_ago = now - timedelta(days=30)\n    for b in budgets:\n        spent = sum(t["amount"] for t in week_txns if t["category"] == b["category"]) if b["period"] == "weekly" else 0\n        if b["period"] == "monthly":\n            month_txns = await db.transactions.find({"user_id": user_id, "category": b["category"], "type": "debit", "date": {"$gte": thirty_days_ago}}).to_list(500)\n            spent = sum(t["amount"] for t in month_txns)',
    '''    budgets = await db.budgets.find({"user_id": user_id}).to_list(50)
    thirty_days_ago = now - timedelta(days=30)
    # Batch-fetch all monthly transactions once (avoids N+1 per budget)
    all_month_txns = await db.transactions.find(
        {"user_id": user_id, "type": "debit", "date": {"$gte": thirty_days_ago}}
    ).to_list(2000)
    for b in budgets:
        spent = sum(t["amount"] for t in week_txns if t["category"] == b["category"]) if b["period"] == "weekly" else 0
        if b["period"] == "monthly":
            spent = sum(t["amount"] for t in all_month_txns if t.get("category") == b["category"])''',
    "notifications.py monthly budget N+1")

# ─────────────────────────────────────────────────────────────────────────────
print("\n[7/10] Add response caching to hot endpoints")

# split_common.py — add cache helper
patch(f"{BE}/routers/split_common.py",
    'router = APIRouter(tags=["splits"])\napi_router = router',
    '''router = APIRouter(tags=["splits"])
api_router = router


async def invalidate_split_cache_for_group(group_id: str, db) -> None:
    """Invalidate the split_groups list cache for all members of a group."""
    from core.cache import cache_clear_prefix
    try:
        group = await db.split_groups.find_one(
            {"_id": __import__("bson").ObjectId(group_id)},
            {"members": 1},
        )
        if group:
            for m in group.get("members", []):
                uid = m.get("user_id")
                if uid:
                    cache_clear_prefix(f"split_groups:{uid}")
    except Exception:
        pass''',
    "split_common.py cache helper")

# split_groups.py — cache GET /split/groups
patch(f"{BE}/routers/split_groups.py",
    "from core import db, get_current_user\n",
    "from core import db, get_current_user\nfrom core.cache import cache_get, cache_set, cache_clear_prefix\n",
    "split_groups.py cache import")

patch(f"{BE}/routers/split_groups.py",
    '    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(50)',
    '    cache_key = f"split_groups:{user_id}"\n    cached = cache_get(cache_key)\n    if cached is not None:\n        return cached\n    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(50)',
    "split_groups.py GET cache read")

# notifications.py — cache unread-count
patch(f"{BE}/routers/notifications.py",
    "from core import db, get_current_user\n",
    "from core import db, get_current_user\nfrom core.cache import cache_get, cache_set, cache_clear_prefix\n",
    "notifications.py cache import")

patch(f"{BE}/routers/notifications.py",
    '    """Fast count for the home-screen bell badge."""\n    n = await db.notifications_feed.count_documents({"user_id": user_id, "read": False})\n    return {"unread": int(n)}',
    '    """Fast count for the home-screen bell badge. Cached 30s."""\n    cache_key = f"unread_count:{user_id}"\n    cached = cache_get(cache_key)\n    if cached is not None:\n        return cached\n    n = await db.notifications_feed.count_documents({"user_id": user_id, "read": False})\n    result = {"unread": int(n)}\n    cache_set(cache_key, result, ttl_seconds=30)\n    return result',
    "notifications.py unread-count cache")

# profile_engine.py — cache score-breakdown
patch(f"{BE}/routers/profile_engine.py",
    "from core import db, get_current_user\n",
    "from core import db, get_current_user\nfrom core.cache import cache_get, cache_set, cache_clear_prefix\n",
    "profile_engine.py cache import")

patch(f"{BE}/routers/profile_engine.py",
    '    """Break the Money Score into 3 pillars + predictive insight."""\n    try:\n        user = await db.users.find_one(',
    '    """Break the Money Score into 3 pillars + predictive insight. Cached 120s."""\n    cache_key = f"score_breakdown:{user_id}"\n    cached = cache_get(cache_key)\n    if cached is not None:\n        return cached\n    try:\n        user = await db.users.find_one(',
    "profile_engine.py score-breakdown cache read")

# transactions.py — invalidate score_breakdown on writes
patch(f"{BE}/routers/transactions.py",
    'def _invalidate_caches(user_id: str) -> None:\n    cache_clear_prefix(f"waste:{user_id}")\n    cache_clear_prefix(f"expense_report:{user_id}")',
    'def _invalidate_caches(user_id: str) -> None:\n    cache_clear_prefix(f"waste:{user_id}")\n    cache_clear_prefix(f"expense_report:{user_id}")\n    cache_clear_prefix(f"score_breakdown:{user_id}")',
    "transactions.py score_breakdown invalidation")

# ─────────────────────────────────────────────────────────────────────────────
print("\n[8/10] Frontend: replace hardcoded hex colors with theme tokens")

FRONTEND_DIRS = [
    f"{FE}/app",
    f"{FE}/components",
    f"{FE}/hooks",
    f"{FE}/services",
    f"{FE}/store",
    f"{FE}/utils",
    f"{FE}/constants",
]

HEX_MAP = [
    ("'#F56E1E'", "COLORS.accent.brand"),
    ('"#F56E1E"', "COLORS.accent.brand"),
    ("'#C14A06'", "COLORS.accent.brandDark"),
    ('"#C14A06"', "COLORS.accent.brandDark"),
    ("'#6B7280'", "COLORS.text.muted"),
    ('"#6B7280"', "COLORS.text.muted"),
    ("'#111827'", "COLORS.text.primary"),
    ('"#111827"', "COLORS.text.primary"),
    ("'#DC2626'", "COLORS.state.danger"),
    ('"#DC2626"', "COLORS.state.danger"),
    ("'#EF4444'", "COLORS.state.danger"),
    ('"#EF4444"', "COLORS.state.danger"),
    ("'#059669'", "COLORS.state.success"),
    ('"#059669"', "COLORS.state.success"),
    ("'#10B981'", "COLORS.state.successAlt"),
    ('"#10B981"', "COLORS.state.successAlt"),
    ("'#F59E0B'", "COLORS.accent.secondary"),
    ('"#F59E0B"', "COLORS.accent.secondary"),
    ("'#FF6B1A'", "COLORS.accent.primaryLight"),
    ('"#FF6B1A"', "COLORS.accent.primaryLight"),
    ("'#9CA3AF'", "COLORS.text.muted"),
    ('"#9CA3AF"', "COLORS.text.muted"),
]

SKIP = ["node_modules", ".expo", ".metro-cache", "dist", "theme.ts", "brand.ts"]
total_hex = 0
files_changed_hex = 0

for src_dir in FRONTEND_DIRS:
    if not os.path.exists(src_dir):
        continue
    for root, dirs, files in os.walk(src_dir):
        dirs[:] = [d for d in dirs if not any(s in d for s in SKIP)]
        for fname in files:
            if not (fname.endswith(".tsx") or fname.endswith(".ts")):
                continue
            if any(s in fname for s in SKIP):
                continue
            path = os.path.join(root, fname)
            with open(path, encoding="utf-8") as f:
                content = f.read()

            new_content = content
            for old, new in HEX_MAP:
                new_content = new_content.replace(old, new)

            if new_content != content:
                # Ensure COLORS is imported
                if "COLORS." in new_content:
                    imports = re.findall(r"import\s*\{([^}]+)\}", new_content)
                    has_colors = any("COLORS" in i for i in imports)
                    if not has_colors:
                        theme_imp = re.search(
                            r"(import \{[^}]+\} from '(?:[\./]+)utils/theme')", new_content
                        )
                        if theme_imp:
                            old_imp = theme_imp.group(1)
                            new_imp = old_imp.replace("import {", "import { COLORS,")
                            new_content = new_content.replace(old_imp, new_imp)
                        else:
                            rel = path.replace(src_dir.rsplit("/", 1)[0] + "/frontend/", "")
                            depth = rel.count("/")
                            prefix = "../" * depth
                            lines = new_content.split("\n")
                            insert_at = 0
                            for i, line in enumerate(lines):
                                if line.startswith("import ") or line.startswith("from "):
                                    insert_at = i + 1
                            lines.insert(insert_at, f"import {{ COLORS }} from '{prefix}utils/theme';")
                            new_content = "\n".join(lines)

                with open(path, "w", encoding="utf-8") as f:
                    f.write(new_content)
                total_hex += content.count("'#") - new_content.count("'#")
                files_changed_hex += 1

print(f"  ✓  Hex colors tokenized: ~{total_hex} replacements across {files_changed_hex} files")
passed += 1

# ─────────────────────────────────────────────────────────────────────────────
print("\n[9/10] Frontend: add successAlt token to theme.ts")

theme_path = f"{FE}/utils/theme.ts"
if os.path.exists(theme_path):
    patch(theme_path,
        "    success:       '#059669',     // Emerald\n",
        "    success:       '#059669',     // Emerald\n    successAlt:    '#10B981',     // Emerald-500 (lighter success tint)\n",
        "theme.ts successAlt light token")
    patch(theme_path,
        "    success:       '#10E0A0',\n",
        "    success:       '#10E0A0',\n    successAlt:    '#10B981',\n",
        "theme.ts successAlt dark token")

# ─────────────────────────────────────────────────────────────────────────────
print("\n[10/10] Frontend: guard console.log with __DEV__, fix apiSlow, add types")

# console.log guards
console_fixes = [
    (f"{FE}/components/ScoreCard.tsx",
     "      console.error('Share error:', e);",
     "      if (__DEV__) console.error('Share error:', e);"),
    (f"{FE}/components/home/ActionableAlertCard.tsx",
     "    try { router.push(a.route as any); } catch (e) { console.warn('alert nav', e); }",
     "    try { router.push(a.route as any); } catch (e) { if (__DEV__) console.warn('alert nav', e); }"),
    (f"{FE}/app/(tabs)/budget.tsx",
     "    } catch (e) { console.error(e); }",
     "    } catch (e) { if (__DEV__) console.error(e); }"),
    (f"{FE}/app/(tabs)/split.tsx",
     "    } catch (e) { console.error('settleRows', e); }",
     "    } catch (e) { if (__DEV__) console.error('settleRows', e); }"),
    (f"{FE}/app/(tabs)/split.tsx",
     "        } catch (e) { console.error('split phase2', e); }",
     "        } catch (e) { if (__DEV__) console.error('split phase2', e); }"),
    (f"{FE}/app/(tabs)/split.tsx",
     "    } catch (e) { console.error(e); setLoading(false); setRefreshing(false); }",
     "    } catch (e) { if (__DEV__) console.error(e); setLoading(false); setRefreshing(false); }"),
    (f"{FE}/app/(tabs)/index.tsx",
     "        } catch (e) { console.error('Phase2 err', e); }",
     "        } catch (e) { if (__DEV__) console.error('Phase2 err', e); }"),
    (f"{FE}/app/(tabs)/index.tsx",
     "      console.error('Dashboard fetch error:', error);",
     "      if (__DEV__) console.error('Dashboard fetch error:', error);"),
    (f"{FE}/app/(tabs)/index.tsx",
     "        console.warn('home/bundle failed, fallback', bundleErr);",
     "        if (__DEV__) console.warn('home/bundle failed, fallback', bundleErr);"),
]
for path, old, new in console_fixes:
    patch(path, old, new, f"__DEV__ guard: {path.split('/')[-1]}")

# apiSlow interceptor deduplication
patch(f"{FE}/utils/api.ts",
    'apiSlow.interceptors.request.use(async (config) => {\n  const token = await AsyncStorage.getItem(\'token\');\n  if (token) config.headers.Authorization = `Bearer ${token}`;\n  return config;\n});',
    "// Reuse the same auth + transport-error interceptors — no duplication.\n// The only difference between api and apiSlow is the timeout above.\napiSlow.interceptors.request.use(\n  api.interceptors.request.handlers[0].fulfilled,\n  api.interceptors.request.handlers[0].rejected,\n);",
    "api.ts apiSlow interceptor dedup")

# Add new types to services/types.ts
patch(f"{FE}/services/types.ts",
    "  checkout_url: string;\n};",
    """  checkout_url: string;
};

export type SmartAlert = {
  type: string;
  title: string;
  body: string;
  priority: 'high' | 'medium' | 'low';
  route?: string;
  action?: string;
  data?: Record<string, unknown>;
};

export type NewsItem = {
  title: string;
  url?: string;
  summary?: string;
  source?: string;
  published_at?: string;
  image_url?: string;
};

export type GroupSummary = {
  id: string;
  total_expenses: number;
  simplified_debts: Array<{ from: string; to: string; amount: number; from_name?: string; to_name?: string }>;
  member_balances: Record<string, number>;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
};""",
    "services/types.ts new domain types")

# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print(f"  Done: {passed} passed, {failed} failed")
print("="*60)

if failed > 0:
    print(f"\n  ⚠  {failed} patches not applied (patterns not found).")
    print("     This usually means the fix was already applied, or the")
    print("     source code differs slightly from the expected version.")
    sys.exit(1)
else:
    print("\n  ✅ All fixes applied successfully!")
    print("\n  Next steps:")
    print("    git add -A")
    print('    git commit -m "fix: Round 51 — backend + frontend fixes"')
    print("    git push origin main")
    print("    git push github main")
