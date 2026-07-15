# Architekturübersicht

## Stack (D-021)

| Ebene | Technologie | Begründung |
|---|---|---|
| Frontend | Next.js (App Router), TypeScript strict | Mobile-first PWA-fähig, i18n-fähig, breite Community |
| UI | Tailwind CSS 4, shadcn/ui | Barrierearme, anpassbare Komponenten; neutrale Theme-Tokens bis zum Branding-Entscheid |
| Backend | FastAPI, Pydantic v2 | Serverseitige Validierung, automatische OpenAPI-Dokumentation |
| ORM/Migrationen | SQLAlchemy 2, Alembic | Migrationsfähige relationale Datenbank (CLAUDE.md) |
| Datenbank | PostgreSQL 16 | Transaktionssicher, JSONB für Einstellungen, UUID-Schlüssel |
| Tests | pytest (Backend), Vitest + Testing Library (Frontend) | Automatisierte Tests für Geschäftsregeln |
| Qualität | Ruff + mypy strict (Backend), ESLint + Prettier + tsc (Frontend) | Keine `any`, keine stillen Fehler |
| CI | GitHub Actions | Lint, Typecheck, Migrations-Roundtrip, Tests, Build |

## Systemüberblick

```
Browser (mobile first)
   │
   ▼
Frontend  – Next.js, Port 3000
   │  HTTP (JSON), NEXT_PUBLIC_API_URL
   ▼
Backend   – FastAPI, Port 8000, Präfix /api
   │  SQLAlchemy / psycopg
   ▼
PostgreSQL 16 – Docker-Volume db_data
```

## Verzeichnisstruktur

```
grillcrew-fctc/
├── frontend/          Next.js-App (öffentliche Oberfläche + Admin, später)
│   ├── app/           App Router: layout, page, globals.css
│   ├── components/ui/ shadcn/ui-Komponenten (werden per CLI generiert)
│   ├── lib/           Hilfsfunktionen (cn)
│   └── tests/         Vitest
├── backend/
│   ├── app/
│   │   ├── api/       Router (Sprint 1: nur health)
│   │   ├── core/      Konfiguration, Logging
│   │   ├── db/        Base (Namenskonvention), Session
│   │   └── models/    ORM-Modelle (Sprint 1: Organization)
│   ├── alembic/       Migrationen (0001: organization)
│   └── tests/         pytest
├── docs/              Single Source of Truth
├── .github/workflows/ CI
└── docker-compose.yml db + backend + frontend
```

## Fachliche Konventionen (verbindlich, aus CLAUDE.md/BUSINESS_RULES)

- **Zeit:** Persistenz in UTC (`timestamptz`); fachliche Interpretation und Anzeige
  in `Europe/Zurich` (`BUSINESS_TIMEZONE`). Dauern intern in Minuten (Integer),
  nie als frei gerundeter Float.
- **Geld:** Ganzzahlen in Rappen (`amountRappen`, `rateRappenPerHour`).
- **Validierung und Berechtigungen:** ausschliesslich serverseitig verbindlich.
- **Datenschutz:** Telefonnummern und E-Mail-Adressen nie in öffentlichen Antworten;
  Verwaltungslinks nur gehasht speichern.
- **Migrationen:** jede Schemaänderung über Alembic; deterministische
  Constraint-Namen über die Namenskonvention in `app/db/base.py`.
- **Keine stillen Fehler:** zentrales Logging (`app/core/logging.py`),
  Ausnahmen werden geloggt und sichtbar gemacht.

## Vorbereitung, noch nicht umgesetzt

- **PWA:** Manifest und Service Worker folgen in einem späteren Sprint;
  `next.config.ts` und Layout sind dafür offen gehalten.
- **i18n:** Oberfläche ist deutsch; Texte werden ab Sprint 2 über eine
  Übersetzungsschicht geführt (D-014), Sprint 1 enthält nur die Platzhalterseite.
- **Branding:** neutrale Theme-Tokens in `frontend/app/globals.css`,
  klar als Platzhalter markiert (UX_UI.md).
