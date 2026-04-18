"""Shared static content constants — safe to import from both server.py and routers/."""

APP_DOWNLOAD_LINK = "https://mintu.app/download"

# Daily rotating cards for engagement (card-of-the-day endpoint)
DAILY_CARDS = [
    {"type": "fact",      "emoji": "💡", "title": "Did you know?",   "text": "Indians who track expenses save 23% more than those who don't!",                              "color": "#3B82F6"},
    {"type": "challenge", "emoji": "🎯", "title": "Today's Challenge","text": "No unnecessary spending today! Can you do it? 💪",                                           "color": "#8B5CF6"},
    {"type": "quote",     "emoji": "🧠", "title": "Money Wisdom",    "text": "\"The habit of saving is itself an education\" — T. T. Munger",                              "color": "#059669"},
    {"type": "tip",       "emoji": "🔥", "title": "Pro Tip",         "text": "Set up a SIP of just ₹500/month. In 10 years, it could be ₹1.1 lakh!",                      "color": "#F59E0B"},
    {"type": "fact",      "emoji": "📊", "title": "India Stat",      "text": "Only 27% of Indians have a monthly budget. You're already ahead!",                           "color": "#EC4899"},
    {"type": "challenge", "emoji": "⚡", "title": "Quick Win",        "text": "Review your subscriptions today. Cancel one you don't use!",                                 "color": "#10B981"},
    {"type": "quote",     "emoji": "💰", "title": "Wealth Quote",    "text": "\"Don't save what's left after spending. Spend what's left after saving.\" — Warren Buffett","color": "#6366F1"},
    {"type": "tip",       "emoji": "🏦", "title": "Smart Move",      "text": "Keep 3 months expenses in a liquid fund. Better than savings account!",                     "color": "#0EA5E9"},
    {"type": "fact",      "emoji": "🇮🇳", "title": "Indian Finance",  "text": "UPI processed 14 billion transactions last month. Track yours with MintU!",                "color": "#EF4444"},
    {"type": "challenge", "emoji": "🌟", "title": "Streak Builder",  "text": "Log every expense today, no matter how small. Build that habit!",                            "color": "#F97316"},
]
