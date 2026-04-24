"""notifications router — push-token registration, budget alerts, cron-based smart nudges."""
from datetime import datetime, timedelta
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user


def _send_expo_push(token, title, body, data=None):
    """Lazy proxy to server.send_expo_push — avoids circular import."""
    import server  # noqa: PLC0415
    return server.send_expo_push(token, title, body, data)


# Back-compat name referenced inline in the cron-check endpoint below.
send_expo_push = _send_expo_push

router = APIRouter(tags=["notifications"])
api_router = router  # extracted code uses @api_router.*


class PushTokenRegister(BaseModel):
    push_token: str



@api_router.post("/notifications/register-token")
async def register_push_token(data: PushTokenRegister, user_id: str = Depends(get_current_user)):
    """Register Expo push token for a user"""
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"push_token": data.push_token}}
    )
    return {"message": "Push token registered"}


@api_router.post("/notifications/send-test")
async def send_test_push(user_id: str = Depends(get_current_user)):
    """Send a test push notification to the authenticated user's device.

    Useful for verifying push setup end-to-end from the Settings screen.
    Returns {sent, message} so the UI can show a success/error toast.
    """
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token = user.get("push_token")
    if not token:
        return {
            "sent": False,
            "message": "No push token registered. Open the app on a physical device to register.",
        }

    sent = await send_expo_push(
        token,
        "👋 Hey from MintU!",
        "Your push notifications are working. Expect nudges when you're close to budget limits.",
        {"type": "test", "deeplink": "/(tabs)/profile"},
    )
    return {
        "sent": bool(sent),
        "message": "Test push sent — check your notification tray." if sent
        else "Could not deliver to Expo. Token may be stale — try reopening the app.",
    }


@api_router.get("/notifications/check-budget-alerts")
async def check_budget_alerts(user_id: str = Depends(get_current_user)):
    """Check budgets and return any that need alerts"""
    budgets = await db.budgets.find({"user_id": user_id}).to_list(100)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    alerts = []
    for budget in budgets:
        txns = await db.transactions.find({
            "user_id": user_id,
            "category": budget["category"],
            "type": "debit",
            "date": {"$gte": thirty_days_ago}
        }).to_list(1000)
        spent = sum(t["amount"] for t in txns)
        pct = (spent / budget["amount"] * 100) if budget["amount"] > 0 else 0
        
        if pct >= 80:
            alerts.append({
                "category": budget["category"],
                "spent": spent,
                "limit": budget["amount"],
                "percentage": round(pct, 1),
                "severity": "exceeded" if pct >= 100 else "warning",
                "message": f"{'Budget exceeded' if pct >= 100 else 'Nearing limit'}: {budget['category']} at {pct:.0f}% (₹{spent:.0f}/₹{budget['amount']:.0f})"
            })
    
    return {"alerts": alerts, "total": len(alerts)}


@api_router.get("/notifications/smart-triggers")
async def get_smart_notification_triggers(user_id: str = Depends(get_current_user)):
    """Generate all pending smart notifications for user"""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    notifications = []
    
    # 1. Overspend alert (today's spending > daily average)
    seven_days_ago = now - timedelta(days=7)
    week_txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": seven_days_ago}}).to_list(500)
    today_txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": today_start}}).to_list(100)
    
    daily_avg = sum(t["amount"] for t in week_txns) / 7 if week_txns else 0
    today_total = sum(t["amount"] for t in today_txns)
    
    if today_total > daily_avg * 1.5 and today_total > 200:
        notifications.append({
            "type": "overspend",
            "title": "Spending Alert",
            "body": f"You've spent ₹{today_total:.0f} today — {((today_total/daily_avg - 1)*100):.0f}% above your daily average",
            "priority": "high"
        })
    
    # 2. Savings celebration
    if today_total < daily_avg * 0.5 and daily_avg > 100:
        saved = daily_avg - today_total
        notifications.append({
            "type": "savings",
            "title": "Great Job!",
            "body": f"You saved ₹{saved:.0f} today compared to your average. Keep it up!",
            "priority": "low"
        })
    
    # 3. Streak reminder (no txn today by evening)
    if not today_txns and now.hour >= 18:
        notifications.append({
            "type": "streak",
            "title": "Don't break your streak!",
            "body": "You haven't tracked any expenses today. Add one to keep your streak going!",
            "priority": "medium"
        })
    
    # 4. Budget alerts
    budgets = await db.budgets.find({"user_id": user_id}).to_list(50)
    thirty_days_ago = now - timedelta(days=30)
    for b in budgets:
        spent = sum(t["amount"] for t in week_txns if t["category"] == b["category"]) if b["period"] == "weekly" else 0
        if b["period"] == "monthly":
            month_txns = await db.transactions.find({"user_id": user_id, "category": b["category"], "type": "debit", "date": {"$gte": thirty_days_ago}}).to_list(500)
            spent = sum(t["amount"] for t in month_txns)
        pct = (spent / b["amount"] * 100) if b["amount"] > 0 else 0
        if pct >= 100:
            notifications.append({"type": "budget_exceeded", "title": f"{b['category']} Budget Exceeded!", "body": f"₹{spent:.0f} of ₹{b['amount']:.0f} — time to slow down", "priority": "high"})
        elif pct >= 80:
            notifications.append({"type": "budget_warning", "title": f"{b['category']} Budget at {pct:.0f}%", "body": f"₹{spent:.0f} of ₹{b['amount']:.0f} — be careful this week", "priority": "medium"})
    
    # 5. Payday detection (large credit today)
    today_credits = [t for t in today_txns if t.get("type") == "credit"]
    if not today_credits:
        all_today = await db.transactions.find({"user_id": user_id, "type": "credit", "date": {"$gte": today_start}}).to_list(10)
        today_credits = all_today
    for c in today_credits:
        if c["amount"] >= 10000:
            notifications.append({
                "type": "payday",
                "title": "Payday Detected!",
                "body": f"₹{c['amount']:.0f} credited. Let's plan your money for this month!",
                "priority": "medium"
            })
            break
    
    return {"notifications": notifications, "count": len(notifications)}


@api_router.post("/notifications/cron-check")
async def cron_check_notifications():
    """Cron endpoint: check all users for pending notifications and send pushes"""
    users = await db.users.find({"push_token": {"$exists": True, "$ne": None}}).to_list(10000)
    sent_count = 0
    
    for user in users:
        user_id = str(user["_id"])
        token = user.get("push_token", "")
        if not token: continue
        
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)
        
        # Check: already sent today?
        already_sent = await db.sent_notifications.find_one({"user_id": user_id, "date": {"$gte": today_start}})
        if already_sent: continue
        
        # Gather data
        today_txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": today_start}}).to_list(100)
        week_txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": seven_days_ago}}).to_list(500)
        
        today_total = sum(t["amount"] for t in today_txns)
        daily_avg = sum(t["amount"] for t in week_txns) / 7 if week_txns else 0
        
        notification = None
        
        # 1. Overspend
        if today_total > daily_avg * 1.5 and today_total > 200:
            notification = {"title": "Spending Alert ⚠️", "body": f"₹{today_total:.0f} spent today — above your daily average. Watch out!"}
        
        # 2. Budget breach
        if not notification:
            budgets = await db.budgets.find({"user_id": user_id}).to_list(50)
            for b in budgets:
                m_txns = await db.transactions.find({"user_id": user_id, "category": b["category"], "type": "debit", "date": {"$gte": thirty_days_ago}}).to_list(500)
                spent = sum(t["amount"] for t in m_txns)
                pct = (spent / b["amount"] * 100) if b["amount"] > 0 else 0
                if pct >= 100:
                    notification = {"title": f"{b['category']} Budget Exceeded! 🚨", "body": f"₹{spent:.0f} of ₹{b['amount']:.0f} limit. Time to cut back."}
                    break
                elif pct >= 80:
                    notification = {"title": f"{b['category']} Budget Warning ⚠️", "body": f"{pct:.0f}% used (₹{spent:.0f}/₹{b['amount']:.0f}). Slow down!"}
                    break
        
        # 3. Streak reminder (evening)
        if not notification and not today_txns and now.hour >= 18:
            notification = {"title": "Track your expenses! 📝", "body": "Don't break your streak — add today's expenses now."}
        
        # 4. Savings celebration
        if not notification and today_total < daily_avg * 0.5 and daily_avg > 100 and today_txns:
            saved = daily_avg - today_total
            notification = {"title": "Great saving today! 🎉", "body": f"You saved ₹{saved:.0f} compared to your average. Keep it up!"}
        
        if notification:
            success = await send_expo_push(token, notification["title"], notification["body"])
            if success:
                await db.sent_notifications.insert_one({"user_id": user_id, "date": now, **notification})
                sent_count += 1
    
    return {"users_checked": len(users), "notifications_sent": sent_count}

