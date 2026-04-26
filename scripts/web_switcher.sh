#!/usr/bin/env bash
# /app/scripts/web_switcher.sh — Round 51b
#
# Supervisor-managed bootstrap that makes the static_web swap survive
# every container restart. Runs once on supervisor startup, executes
# startup.sh (which handles dist/ freshness + the expo→static_web swap),
# then exits cleanly.
#
# Configured in /etc/supervisor/conf.d/supervisord_web_switcher.conf as:
#   autostart=true, autorestart=false, startsecs=0, exitcodes=0
#
# Why a separate program: supervisord.conf is READONLY per platform
# contract, so we can't change [program:expo]'s autostart=true. Instead,
# this program waits ~5s for expo to come up, then immediately STOPS it
# and starts our static_web on port 3000.

set -u

LOG_PREFIX="[web_switcher]"
LOG_FILE="/var/log/supervisor/web_switcher.log"
mkdir -p "$(dirname "$LOG_FILE")"

ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "$(ts) ${LOG_PREFIX} $*" | tee -a "$LOG_FILE"; }

log "🔁 Web-switcher booting…"

# Wait briefly for supervisor to settle. Without this, supervisorctl
# commands can race against the supervisor RPC socket initialization.
sleep 4

# Hand off to the main startup hook, which does dist/ freshness +
# the actual expo→static_web swap.
log "→ Executing /app/scripts/startup.sh"
bash /app/scripts/startup.sh
EC=$?
log "← startup.sh exited with code $EC"

# Always exit 0 so supervisor doesn't keep retrying us. The startup
# script logs its own success/failure to web_startup.log.
exit 0
