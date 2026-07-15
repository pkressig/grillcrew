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

Keine Secrets committen. Render- und Vercel-Werte werden in den Provider-Dashboards gepflegt.

## Healthchecks

- Backend: `GET /api/health`
- Antwort enthält `status` und `database`.
- Render nutzt `/api/health` als Healthcheck-Pfad.
