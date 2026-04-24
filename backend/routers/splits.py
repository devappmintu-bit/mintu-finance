"""splits router aggregator — retained for backward import compatibility.

Actual endpoint definitions now live in:
    - split_common.py   (schemas, constants, shared APIRouter)
    - split_groups.py   (group CRUD, members, chat messages)
    - split_expenses.py (expense CRUD, summary, split math)
    - split_settle.py   (settlement, balances, reminders, leaderboard)

Importing any of these modules is enough to register their routes on the
shared APIRouter. We keep `from routers.splits import router` working by
re-exporting that router below.
"""
from routers.split_common import router, api_router  # noqa: F401
# Register endpoints by importing the sub-modules for their side-effects.
from routers import split_groups      # noqa: F401
from routers import split_expenses    # noqa: F401
from routers import split_settle      # noqa: F401
from routers import split_reminders   # noqa: F401 — reminders & invite-to-settle
from routers import split_razorpay    # noqa: F401 — Razorpay split settlement flow
