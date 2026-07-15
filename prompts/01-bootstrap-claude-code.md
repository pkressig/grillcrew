# Claude-Code-Prompt 01 – Projekt-Bootstrap

Arbeite im Repository GrillCrew FCTC.

Lies zuerst vollständig:
- `CLAUDE.md`
- `docs/PRD.md`
- `docs/DECISIONS.md`
- `docs/BUSINESS_RULES.md`
- `docs/DATA_MODEL.md`
- `docs/UX_UI.md`
- `docs/ROADMAP.md`
- `docs/BACKLOG.md`

## Aufgabe

Erstelle ausschliesslich die technische Grundlage für Sprint 1. Implementiere noch keine öffentliche Helfereintragung, Familienlogik oder Excel-Importe.

## Zielarchitektur

Schlage vor Beginn einen aktuellen, stabilen TypeScript-Stack vor und begründe jede zentrale Abhängigkeit kurz. Verwende keine erfundenen oder experimentellen Versionsnummern. Prüfe die tatsächlich installierbaren Versionen in der Entwicklungsumgebung.

Die Anwendung muss:
- lokal mit Docker Compose startbar sein
- PostgreSQL verwenden
- TypeScript strict verwenden
- eine migrationsfähige ORM-Lösung verwenden
- ein automatisiertes Test-Setup besitzen
- Formatierung, Linting und Typecheck besitzen
- für eine PWA vorbereitet sein
- Internationalisierung für Deutsch vorbereiten
- Zeitzone Europe/Zurich fachlich berücksichtigen

## Sprint-1-Umfang

1. App-Grundgerüst
2. PostgreSQL in Docker Compose
3. Umgebungsvariablen mit `.env.example`
4. Datenbankschema zunächst für:
   - Organization
   - User
   - StaffMembership
   - ClubYear
   - Season
5. Admin-Authentifizierung
6. rollenbasierte serverseitige Zugriffskontrolle
7. minimale Admin-Oberfläche:
   - Login
   - geschützte Startseite
   - Organisationseinstellungen
   - Vereinsjahr-/Saisonliste als Grundfunktion
8. Seed-Daten für lokale Entwicklung
9. Unit-Tests für Rollenprüfung und Saisonzuordnung
10. Integrations-/Smoke-Test für Login und geschützte Route
11. README mit exakten Startbefehlen

## Qualitätsanforderungen

- Keine Platzhalter-TODOs für Kernbestandteile des Sprintumfangs.
- Keine `any`-Typen.
- Keine Geheimnisse im Repository.
- Server- und Client-Berechtigungen nicht verwechseln; Server ist verbindlich.
- Sämtliche Datenbankänderungen über Migrationen.
- Saubere Fehlerseiten und Ladezustände.
- Mobile-first Grundlayout.
- Noch kein finales Branding erfinden; nutze klar markierte neutrale Theme-Tokens.
- Dokumentiere jede neue Architekturentscheidung in `docs/DECISIONS.md`.
- Aktualisiere `README.md` und `docs/ROADMAP.md` nach Abschluss.

## Arbeitsweise

1. Gib zuerst einen konkreten Implementierungsplan und die geplante Dateistruktur aus.
2. Warte auf Freigabe, bevor du grössere Abhängigkeiten installierst oder Code erzeugst.
3. Arbeite danach in kleinen, überprüfbaren Schritten.
4. Führe nach jedem Schritt relevante Tests aus.
5. Am Ende liefere:
   - Zusammenfassung
   - geänderte Dateien
   - Startbefehle
   - Testergebnisse
   - verbleibende Risiken
   - Vorschlag für Sprint 2

Erweitere den Produktumfang nicht eigenmächtig.
