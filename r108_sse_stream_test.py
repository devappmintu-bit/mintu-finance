"""R108 — Verify /api/coach/chat-stream SSE endpoint.

Tests the new server-sent events streaming endpoint while ensuring the
existing /api/coach/chat and /api/health remain healthy.
"""
import json
import sys
import time
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []


def record(name: str, ok: bool, info: str = ""):
    icon = "✅" if ok else "❌"
    print(f"{icon} {name}: {info}")
    results.append((name, ok, info))


def auth() -> str:
    s = requests.post(
        f"{BASE}/auth/send-otp",
        json={"phone": PHONE},
        timeout=15,
    )
    record("send-otp", s.status_code == 200, f"status={s.status_code}")
    v = requests.post(
        f"{BASE}/auth/verify-otp",
        json={
            "phone": PHONE,
            "otp": OTP,
            "device_id": "sdet-r108",
            "device_name": "SDET",
            "os": "linux",
        },
        timeout=15,
    )
    if v.status_code != 200:
        record("verify-otp", False, f"status={v.status_code} body={v.text[:200]}")
        sys.exit(1)
    token = v.json()["access_token"]
    record("verify-otp", True, f"token len={len(token)}")
    return token


def parse_sse_stream(resp) -> list[dict]:
    """Read raw bytes, split into events, parse JSON payloads."""
    buf = b""
    events = []
    started = time.time()
    for chunk in resp.iter_content(chunk_size=None):
        if chunk is None:
            continue
        buf += chunk
        # Split on event boundary (\n\n)
        while b"\n\n" in buf:
            raw_event, buf = buf.split(b"\n\n", 1)
            line = raw_event.decode("utf-8", errors="replace").strip()
            # Each event may have multiple "data:" lines, but ours emits one.
            if not line.startswith("data:"):
                continue
            payload = line[len("data:"):].strip()
            try:
                events.append(json.loads(payload))
            except json.JSONDecodeError as e:
                events.append({"_parse_error": str(e), "_raw": payload})
        if time.time() - started > 35:
            print("  ! parse loop exceeded 35s — aborting read")
            break
    return events


def test_stream_happy(token: str):
    print("\n— T1: POST /coach/chat-stream happy path —")
    t0 = time.time()
    with requests.post(
        f"{BASE}/coach/chat-stream",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "I spent 450 on Swiggy"},
        stream=True,
        timeout=35,
    ) as resp:
        ct = resp.headers.get("Content-Type", "")
        record("T1.status==200", resp.status_code == 200, f"got {resp.status_code}")
        record(
            "T1.content-type starts text/event-stream",
            ct.startswith("text/event-stream"),
            f"got '{ct}'",
        )
        if resp.status_code != 200:
            print("  body:", resp.text[:300])
            return
        events = parse_sse_stream(resp)
    elapsed = time.time() - t0
    record("T1.wall_time<=30s", elapsed <= 30.0, f"elapsed={elapsed:.2f}s")
    record("T1.event_count>=2", len(events) >= 2, f"count={len(events)}")

    if not events:
        return

    first = events[0]
    record(
        "T1.first event type=='open'",
        first.get("type") == "open",
        f"first={first}",
    )

    # Expected structure
    chunk_events = [e for e in events if e.get("type") == "chunk"]
    done_events = [e for e in events if e.get("type") == "done"]

    record(
        "T1.exactly 1 done event",
        len(done_events) == 1,
        f"done count={len(done_events)}",
    )
    record(
        "T1.done is last event",
        events[-1].get("type") == "done",
        f"last type={events[-1].get('type')}",
    )

    if not done_events:
        print("  events:", events[:5])
        return

    done = done_events[0]
    required = [
        ("reply", str),
        ("confidence", (int, float)),
        ("confidence_label", str),
        ("source", str),
        ("actions", list),
        ("follow_ups", list),
        ("stage", int),
    ]
    for key, types in required:
        ok = key in done and isinstance(done[key], types)
        record(
            f"T1.done.{key} present & type ok",
            ok,
            f"value={done.get(key) if key!='reply' else (done.get(key) or '')[:80]!r}",
        )

    # Concatenated chunks should be a superset of done.reply
    concat = "".join(c.get("delta", "") for c in chunk_events)
    reply = done.get("reply", "")
    print(f"  chunks concatenated ({len(concat)} chars): {concat[:200]!r}")
    print(f"  reply ({len(reply)} chars): {reply[:200]!r}")
    record(
        "T1.>=1 chunk event",
        len(chunk_events) >= 1,
        f"chunk count={len(chunk_events)}",
    )

    # Reply may have [ACTION:...] markers stripped — so reply core text should be in concat
    # Try direct or whitespace-normalized containment.
    def norm(s: str) -> str:
        return " ".join(s.split())

    contained = norm(reply) in norm(concat)
    if not contained:
        # tolerate: at least 80% of reply tokens should be in concat
        rwords = set(norm(reply).split())
        cwords = set(norm(concat).split())
        overlap = len(rwords & cwords) / max(len(rwords), 1)
        contained = overlap >= 0.8
        record(
            "T1.chunks⊇reply (token overlap≥80% fallback)",
            contained,
            f"overlap={overlap:.0%}",
        )
    else:
        record("T1.chunks⊇reply (substring match)", True, "exact-substring ok")


def test_no_auth():
    print("\n— T2: POST /coach/chat-stream WITHOUT auth → 401 —")
    r = requests.post(
        f"{BASE}/coach/chat-stream",
        json={"message": "hi"},
        timeout=10,
    )
    record(
        "T2.status==401 (or 4xx)",
        r.status_code == 401,
        f"got {r.status_code}; body={r.text[:120]}",
    )


def test_empty_body(token: str):
    print("\n— T3: POST /coach/chat-stream empty body → 4xx —")
    # Truly empty body — FastAPI should return 422 (or other 4xx)
    r = requests.post(
        f"{BASE}/coach/chat-stream",
        headers={"Authorization": f"Bearer {token}"},
        json={},
        timeout=10,
    )
    record(
        "T3.status is 4xx",
        400 <= r.status_code < 500,
        f"got {r.status_code}; body={r.text[:120]}",
    )


def test_legacy_chat(token: str):
    print("\n— T4: POST /coach/chat legacy still works —")
    r = requests.post(
        f"{BASE}/coach/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "hi"},
        timeout=30,
    )
    record(
        "T4.legacy /chat status==200",
        r.status_code == 200,
        f"got {r.status_code}",
    )
    if r.status_code == 200:
        d = r.json()
        for k in ("reply", "confidence", "confidence_label", "source", "actions", "follow_ups", "stage"):
            record(
                f"T4.legacy /chat has '{k}'",
                k in d,
                f"value type={type(d.get(k)).__name__}",
            )


def test_health():
    print("\n— T5: /health stays 200 —")
    r = requests.get(f"{BASE}/health", timeout=10)
    record("T5./health==200", r.status_code == 200, f"got {r.status_code}; body={r.text[:80]}")


def main():
    token = auth()
    test_stream_happy(token)
    test_no_auth()
    test_empty_body(token)
    test_legacy_chat(token)
    test_health()

    # Summary
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 60)
    print(f"R108 SSE summary: {passed}/{total} assertions passed")
    fails = [(n, i) for n, ok, i in results if not ok]
    if fails:
        print("FAILED:")
        for n, i in fails:
            print(f"  ✗ {n} — {i}")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
