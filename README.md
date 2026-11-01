# Skisaison

Persönliche App für die Saison mit dem Kärntner Skipass: alle 31 Skigebiete auf einer Karte, Anreise mit Bahn und Bus ab Villach, Wetter, Webcams, Tagebuch mit Fotos und die Rechnung, ab wann sich der Pass lohnt.

Läuft als installierbare Web-App (PWA) unter https://ski.olomek.com.

## Aufbau

```
public/   Die App (HTML, CSS, JS, Manifest, Service Worker, Icons)
server/   Kleiner Node-Server: liefert die App aus und bietet die API
deploy/   systemd-Dienst, nginx-Konfiguration, Update-Skript
docs/     Frühere Entwürfe
```

Der Server hat eine einzige Abhängigkeit (`hafas-client` für ÖBB-Verbindungen). Daten liegen in SQLite (`node:sqlite`, eingebaut ab Node 22.13), Fotos als Dateien in `data/photos`.

## Funktionen

- **Karte und Gebiete:** Pisten, Lifte, Pistenplan, Webcams und Kontakt aus kaerntner-skipass.com
- **Anreise:** Ablauf ab Villach Hbf, nächste Verbindungen live von der ÖBB, Scotty-Link mit Tag und Uhrzeit, Anreise-Seiten der Skigebiete
- **Wetter:** meteoblue-Meteogramm pro Gebiet
- **Trips:** Kombis mit Übernachtung und ob sich die Nacht lohnt
- **Tagebuch:** Skitage mit Fotos, Werte aus Strava (und damit von der Garmin-Uhr)
- **Rechnung:** Tagespreise je Gebiet gegen den Passpreis

## Lokal starten

```bash
cp .env.example .env   # Passwort und SESSION_SECRET eintragen
npm install
npm run dev
```

## API

Alle Routen außer `/api/health`, `/api/login` und `/api/me` brauchen eine Anmeldung.

| Route | Zweck |
|---|---|
| `POST /api/login` | Anmelden mit `APP_PASSWORD`, setzt ein Sitzungs-Cookie |
| `GET/PUT /api/state` | Tagebuch, Trip, Passpreis und eigene Tagespreise |
| `POST /api/photos`, `GET /api/photos/:id` | Fotos hochladen und laden |
| `GET /api/journeys?to=&when=` | Verbindungen ab Villach Hbf (ÖBB) |
| `GET /api/strava/activities?date=` | Skiaktivitäten eines Tages von Strava |
| `GET /auth/strava` | Strava verbinden |

## Server

Läuft auf dem Hetzner-Server neben anderen Projekten, streng getrennt:

- eigener Benutzer `ski`, eigenes Node unter `/home/ski/.local/node`
- Dienst `ski.service`, hört nur auf `127.0.0.1:3100`
- nginx: eigene Datei `sites-available/ski.olomek.com`, Zertifikat von Let's Encrypt

Update nach einem Push:

```bash
ssh root@157.180.85.161 /home/ski/app/deploy/update.sh
```

Komplett entfernen, ohne andere Projekte zu berühren:

```bash
rm /etc/nginx/sites-enabled/ski.olomek.com && nginx -t && systemctl reload nginx
systemctl disable --now ski && rm /etc/systemd/system/ski.service
userdel -r ski
```

## Strava einrichten

1. Auf https://www.strava.com/settings/api eine App anlegen, „Authorization Callback Domain“: `ski.olomek.com`
2. `STRAVA_CLIENT_ID` und `STRAVA_CLIENT_SECRET` in `/home/ski/app/.env` eintragen
3. `systemctl restart ski`, dann in der App unter ⓘ „Mit Strava verbinden“

## Hinweise

- Die ÖBB-Verbindungen nutzen die inoffizielle Schnittstelle der ÖBB-App. Fällt sie aus, bleibt der Scotty-Link.
- Skiline (Liftfahrten zur Skipassnummer) hat keine offizielle API und ist noch nicht eingebaut.
- Tagespreise wurden am 1.11.2026 recherchiert, einige sind Vorjahreswerte oder geschätzt (in der App markiert).
