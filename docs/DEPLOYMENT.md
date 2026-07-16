# Deployment

## Zielarchitektur

- Frontend: Vercel, Root Directory `frontend`
- Backend: Render Web Service aus `backend`
- Datenbank: Render PostgreSQL

## Vercel

Projektkonfiguration:

- Framework Preset: Next.js
- Root Directory: `frontend`
- Build Command: `npm run build`
- Install Command: `npm ci`

Erforderliche Environment Variables:

- `NEXT_PUBLIC_API_URL`: öffentliche Backend-URL, z. B. `https://grillcrew-api.onrender.com`
- `NEXT_TELEMETRY_DISABLED`: `1`

## Render

`render.yaml` beschreibt einen PostgreSQL-Dienst und den FastAPI-Webservice. Der Backend-Start führt vor dem Uvicorn-Start `alembic upgrade head` aus.

Erforderliche Environment Variables:

- `APP_ENV`: `production`
- `LOG_LEVEL`: `INFO`
- `LOG_FORMAT`: `json`
- `BUSINESS_TIMEZONE`: `Europe/Zurich`
- `DATABASE_URL`: von Render PostgreSQL gesetzt
- `CORS_ALLOWED_ORIGINS`: kommagetrennte erlaubte Frontend-Ursprünge, z. B. `https://grillcrew.vercel.app`

Ab F002 (Authentifizierung, D-037–D-040) zusaetzlich erforderlich, sobald die zugehoerigen Endpunkte
live gehen:

- `JWT_SECRET_KEY`: eindeutiges, zufaelliges Secret fuer die Access-Token-Signierung (mind. 32 Zeichen);
  niemals der Entwicklungs-Default aus `app/core/config.py`. Die CSRF-Signierung wird per HMAC aus
  diesem Secret abgeleitet, kein separates Secret noetig.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS`: Transport fuer
  Passwort-Reset- und Einladungs-E-Mails (D-040); ohne `SMTP_HOST` faellt das Backend ausserhalb von
  `APP_ENV=development`/`test` mit einem Konfigurationsfehler auf, statt E-Mails stillschweigend nicht
  zu versenden.
- `EMAIL_FROM_ADDRESS`: plattformweite Absenderadresse; nicht pro Organisation konfigurierbar (siehe
  D-040, Deliverability-Begruendung).
- `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_DOMAIN`, Token-Laufzeiten sowie die `AUTH_RATE_LIMITS__*`-Variablen
  (D-038) haben produktionstaugliche Defaults und muessen nur bei abweichendem Bedarf gesetzt werden.

Keine Secrets committen. Render- und Vercel-Werte werden in den Provider-Dashboards gepflegt.

## Healthchecks

- Backend: `GET /api/health`
- Antwort enthält `status` und `database`.
- Render nutzt `/api/health` als Healthcheck-Pfad.
