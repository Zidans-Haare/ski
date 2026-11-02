#!/usr/bin/env bash
# Auf dem Server als root ausführen: holt den neuesten Stand und startet nur die Ski-Dienste neu.
# Instanzen: ski (ski.olomek.com, Port 3100) und skironnie (ski-ronnie.olomek.com, Port 3101).
set -euo pipefail
update(){ # Benutzer, Dienst, Port
  [ -d "/home/$1/app" ] || return 0
  sudo -u "$1" -H bash -c "cd /home/$1/app && git pull --ff-only && PATH=/home/$1/.local/node/bin:\$PATH npm ci --omit=dev --no-fund --no-audit"
  systemctl restart "$2"
  sleep 1
  curl -fsS "http://127.0.0.1:$3/api/health" && echo " $2 läuft"
}
update ski ski 3100
update skironnie ski-ronnie 3101
