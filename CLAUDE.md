# CLAUDE.md – GrillCrew FCTC

## Rolle

Du arbeitest als verantwortlicher Senior Full-Stack-Entwickler an GrillCrew FCTC. Implementiere nur Anforderungen, die in den Projektdokumenten beschlossen sind. Erfinde keine zusätzlichen Produktfunktionen.

## Vor jeder Aufgabe

1. Lies `docs/PRD.md`.
2. Lies `docs/DECISIONS.md`.
3. Lies die für die Aufgabe relevanten Fachdokumente.
4. Prüfe `docs/BACKLOG.md`, damit spätere Ideen nicht versehentlich in Version 1 geraten.
5. Formuliere vor grösseren Änderungen einen kurzen Plan.
6. Stelle nur dann Rückfragen, wenn eine fachliche Entscheidung wirklich fehlt.

## Produktprinzipien

- Mobile first
- für Jung und Alt verständlich
- keine erzwungene Registrierung für Helfer
- grosse Interaktionsflächen und klare Sprache
- öffentliche Telefonnummern sind verboten
- vollständige Namen dürfen im öffentlichen Einsatzplan sichtbar sein
- Helfer und begünstigte Familie sind getrennte Entitäten
- Vergütungsart wird pro Einsatz gewählt, nicht global pro Person
- Events und Schichten sind getrennte Entitäten
- Herbst und Frühling sind separat und gemeinsam auswertbar
- Admin-Funktionen dürfen die öffentliche Oberfläche nicht überladen

## Entwicklungsregeln

- TypeScript strict
- keine `any` ohne schriftliche Begründung
- keine stillen Fehler
- Eingaben serverseitig validieren
- Berechtigungen serverseitig durchsetzen
- personenbezogene Daten minimieren und schützen
- migrationsfähige relationale Datenbank
- automatisierte Tests für Geschäftsregeln
- barrierearme Bedienung
- deutsche Oberfläche, technisch übersetzbar
- Datums-/Zeitlogik für Zeitzone Europe/Zurich
- Geldwerte als Ganzzahl in Rappen speichern
- Arbeitsdauer nicht als frei gerundeten Float speichern

## Dokumentationspflicht

Bei jeder fachlich relevanten Änderung:
- bestehende Dokumentation aktualisieren
- neue Entscheidung in `docs/DECISIONS.md` ergänzen
- verschobene Funktion in `docs/BACKLOG.md` eintragen
- keine widersprüchlichen Kopien derselben Regel erzeugen

## Verboten

- ungefragte KI-Funktionen
- Gamification in Version 1
- öffentliche Telefonnummern oder E-Mail-Adressen
- Multi-Tenant-Komplexität in Version 1
- WhatsApp-Business-API in Version 1
- native Mobile-App in Version 1
- unkontrollierte automatische Zusammenführung von Personen nur anhand des Namens
