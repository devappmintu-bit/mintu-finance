"""Regex-based parser for Indian bank transaction SMS/email bodies.

Handles: HDFC, SBI, ICICI, Axis, Kotak, Yes Bank, IndusInd, Federal, Bank of Baroda, etc.
Returns None if body does NOT look like a txn alert. Otherwise returns a dict:
  {amount, type ('debit'|'credit'), merchant, last4, category, date}

Design: one or two permissive master regexes that cover the 90% common
patterns, then category inference via merchant keywords.
"""
from __future__ import annotations
import re
from datetime import datetime
from typing import Optional, Dict


# Senders we care about (exact match, case-insensitive)
BANK_SENDERS = [
    "alerts@hdfcbank.net",
    "alerts@sbi.co.in",
    "notify@icicibank.com",
    "cbsalerts@axisbank.com",
    "alerts@kotak.com",
    "alerts@yesbank.in",
    "alerts@indusind.com",
    "notifications@federalbank.co.in",
    "alerts@bankofbaroda.co.in",
]
# Gmail search query — `from:` supports OR via braces
GMAIL_QUERY = "from:({})".format(" OR ".join(BANK_SENDERS))


# Amount: ₹/Rs/INR followed by digits (with optional commas/decimals)
_AMT_RE = re.compile(
    r"(?:rs\.?|inr|\u20B9)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)",
    re.I,
)
# Debit vs credit keywords
_DEBIT_RE  = re.compile(r"(debited|debit|withdrawn|spent|paid|purchase|sent|transfer to|transferred to|deducted)", re.I)
_CREDIT_RE = re.compile(r"(credited|credit|received|deposit|refund|reversed)", re.I)
# Last 4 of account / card (a/c XXXX1234, card ending 1234, ac no ..1234)
_LAST4_RE = re.compile(r"(?:a/c|ac|acct|account|card)\D{0,8}(?:x|\*){0,6}([0-9]{4})\b", re.I)
# Merchant: after "at", "to", "from", "for" (grab next word group until punctuation)
_MERCHANT_RE = re.compile(
    r"(?:\b(?:at|to|from|towards|for|vpa)\b)\s+([A-Z0-9][A-Za-z0-9 &._\-]{1,45})",
    re.I,
)
# Date patterns (DD-MM-YYYY / DD/MM/YY / DD Mon YYYY)
_DATE_RES = [
    re.compile(r"\b([0-3]?\d)[\-/]([0-1]?\d)[\-/]((?:20)?\d{2})\b"),
    re.compile(r"\b([0-3]?\d)[\- ](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\- ]((?:20)?\d{2})\b", re.I),
]

_MONTH_MAP = {m: i + 1 for i, m in enumerate([
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
])}

# Category inference (merchant keyword → category)
_CAT_KEYWORDS = {
    "Food": ["swiggy", "zomato", "domino", "pizza", "cafe", "restaurant", "food", "eats", "kfc", "mcdonald", "burger"],
    "Transport": ["uber", "ola", "rapido", "irctc", "indigo", "spicejet", "vistara", "metro", "fuel", "petrol", "hpcl", "iocl"],
    "Shopping": ["amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "zara", "hm", "decath"],
    "Groceries": ["bigbasket", "blinkit", "grofers", "zepto", "dmart", "reliance fresh", "spencer"],
    "Entertainment": ["netflix", "prime", "spotify", "hotstar", "youtube", "bookmyshow", "pvr", "inox"],
    "Bills": ["airtel", "jio", "bsnl", "vi ", "vodafone", "electricity", "bescom", "rent", "gas", "water"],
    "Healthcare": ["apollo", "pharmeasy", "netmeds", "pharmacy", "hospital", "clinic", "medic"],
    "Investments": ["zerodha", "groww", "upstox", "sip", "mutual fund", "sbi mf"],
    "Transfer": ["upi", "neft", "imps", "rtgs"],
}


def _infer_category(merchant: str, body: str) -> str:
    hay = f"{merchant or ''} {body or ''}".lower()
    for cat, kws in _CAT_KEYWORDS.items():
        if any(k in hay for k in kws):
            return cat
    return "Other"


def _parse_date(body: str) -> Optional[datetime]:
    for rx in _DATE_RES:
        m = rx.search(body)
        if not m:
            continue
        try:
            d = int(m.group(1))
            mo = m.group(2)
            if mo.isdigit():
                mo = int(mo)
            else:
                mo = _MONTH_MAP.get(mo.lower(), 1)
            y = int(m.group(3))
            if y < 100:
                y += 2000
            return datetime(y, mo, d)
        except Exception:
            continue
    return None


def parse_bank_body(body: str, subject: str = "", received_at: Optional[datetime] = None) -> Optional[Dict]:
    """Parse a bank email/SMS body into structured txn fields. Returns None if not a txn alert."""
    if not body:
        return None
    b = body.replace("\r", " ").replace("\n", " ")
    txt = f"{subject} {b}"

    # Amount (required)
    amt_match = _AMT_RE.search(txt)
    if not amt_match:
        return None
    try:
        amount = float(amt_match.group(1).replace(",", ""))
    except ValueError:
        return None
    if amount <= 0 or amount > 10_000_000:  # sanity: ≤ 1 Cr per txn
        return None

    # Type
    if _DEBIT_RE.search(txt):
        txn_type = "debit"
    elif _CREDIT_RE.search(txt):
        txn_type = "credit"
    else:
        return None  # Not a txn alert

    # Last 4 (optional)
    l4 = None
    m = _LAST4_RE.search(txt)
    if m:
        l4 = m.group(1)

    # Merchant (optional; may be empty)
    merchant = ""
    mm = _MERCHANT_RE.search(b)
    if mm:
        merchant = mm.group(1).strip().strip(".,;:").title()
        # Cut off trailing junk like " on 12-Apr-26" or " -- info"
        merchant = re.split(r"\s+(?:on|dated|\-\-|ref|info|avl|available|upi|txn|vpa)\b", merchant, maxsplit=1, flags=re.I)[0].strip()
        # Limit length
        merchant = merchant[:48]

    # Date
    date = _parse_date(b) or received_at or datetime.utcnow()

    category = _infer_category(merchant, b)

    return {
        "amount": round(amount, 2),
        "type": txn_type,
        "merchant": merchant or category,
        "description": (merchant or category) + (f" (····{l4})" if l4 else "") + " [Gmail]",
        "last4": l4,
        "category": category,
        "date": date,
    }
