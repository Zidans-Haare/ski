#!/usr/bin/env bash
# Auf dem Server als root ausführen: holt den neuesten Stand und startet nur den Ski-Dienst neu.
set -euo pipefail
sudo -u ski -H bash -c 'cd /home/ski/app && git pull --ff-only && PATH=/home/ski/.local/node/bin:$PATH npm ci --omit=dev --no-fund --no-audit'
systemctl restart ski
sleep 1
curl -fsS http://127.0.0.1:3100/api/health && echo " Skisaison läuft"
