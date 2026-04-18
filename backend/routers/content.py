"""Content router — rotating daily cards."""
import random
from datetime import date
from fastapi import APIRouter, Depends

from core import get_current_user
from core.content import DAILY_CARDS, APP_DOWNLOAD_LINK

router = APIRouter(tags=["content"])


@router.get("/card-of-the-day")
async def card_of_the_day(refresh: bool = False, user_id: str = Depends(get_current_user)):
    """Get daily rotating motivational/financial card.

    Rotates deterministically by date unless `refresh=true` (picks a random card).
    """
    if refresh:
        card = random.choice(DAILY_CARDS)
    else:
        day_index = date.today().toordinal() % len(DAILY_CARDS)
        card = DAILY_CARDS[day_index]
    return {**card, "app_link": APP_DOWNLOAD_LINK}
