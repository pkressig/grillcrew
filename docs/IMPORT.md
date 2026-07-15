# Excel-Analyse und Importstrategie

## Analysierte Dateien

1. `Grillkoordination Aufgaben.xlsx`
2. `Kiosk- u. Grillplan Frühling 2026.xlsx`
3. `Plan Grilleinsätze Frühling 2026.xlsx`
4. `Geleistete Grilleinsätze Saison 2025 2026.xlsx`

## Erkenntnisse

### Koordinationsaufgaben
Der Ablauf umfasst:
- Arbeitszeit laufend erfassen
- Grillzeiten aus Kiosk-/Heimspielplan ableiten
- Gegenkontrolle
- Cupspiele vorab besetzen
- Einsatzplan veröffentlichen
- Helfer informieren und betreuen
- Verschiebungen laufend nachführen
- Betroffene informieren
- Monatspläne drucken
- wöchentliche Abstimmung mit Kiosk/Einkauf
- neue Helfer suchen
- Saisonübersicht erstellen
- unklare Familienzuordnungen abklären
- Abschluss an Vorstand senden

### Kiosk- und Grillplan
Enthält:
- Eventdatum
- Kioskzeiten
- Personalplanung Kiosk
- Grillzeiten als Freitext
- benötigte Helferzahl innerhalb des Freitexts
- Spezialangaben Pommes/Chicken
- Hinweise zu Turnieren, Verschiebungen und Pausen

Problem:
Grillzeiten wie `12.00-17.00/17.00-22.00 / 2` müssen in strukturierte Schichten zerlegt werden.

### Grillplan
Enthält:
- Datum in getrennten Wochentag-/Datumsspalten
- Zeit als Textspanne
- Helfername
- Telefonnummer
- Bemerkung
- Art der Leistung
- Monatsblätter für Ausdruck/Unterschrift
- leere Plätze mit `---`
- teilweise Tippfehler und abgekürzte Namen
- fehlende Telefonnummern

### Geleistete Einsätze
Enthält:
- geplante/effektive Zeit als Text
- Name
- Vergütungsart
- geleistete Stunden
- Summen pro Person
- Zuordnung zu Kind/Familie
- unentgeltliche Stunden
- separate Familienübersichten
- Herbst, Frühling und Total
- Sollregel 8/12 Stunden
- manuelle Erfüllt-Markierung

## Datenqualitätsprobleme

- unterschiedliche Namensreihenfolge
- gemeinsame Personen in einem Namen, z. B. zwei Eltern
- Tippfehler und Abkürzungen
- derselbe Familienname mit verschiedenen Schreibweisen
- Kindlisten als Freitext
- Telefonnummern fehlen oder werden geteilt
- Auszahlung/Unentgeltlich teilweise als Freitext
- Tabellenüberschriften stimmen teilweise nicht mit Saison überein
- Formeln und manuelle Werte sind vermischt
- Stunden werden mehrfach redundant summiert

## Einmaliger Erstimport

### Phase A – Rohdaten
Jede Zeile wird unverändert in einer Staging-Struktur gespeichert:
- Quelldatei
- Tabellenblatt
- Zeilennummer
- Rohwerte
- Importzeitpunkt

### Phase B – Normalisierung
- Datum zusammensetzen
- Zeitspanne parsen
- Telefonnummer normalisieren
- Namen trimmen
- Vergütungsart erkennen
- Dauer in Minuten umrechnen
- offensichtliche Platzhalter ignorieren

### Phase C – Abgleich
- Helfer nach Telefonnummer/E-Mail
- Namensähnlichkeit nur als Vorschlag
- Familien und Kinder manuell bestätigen
- gemeinsame Namen nicht automatisch aufteilen
- Tippfehler über Review-Liste korrigieren

### Phase D – Vorschau
Vor Import anzeigen:
- neue Helfer
- mögliche Dubletten
- fehlende Kontakte
- unklare Familien
- ungültige Zeiten
- unterschiedliche Summen
- zu importierende Events, Schichten und Leistungen

### Phase E – Import
Transaktional:
- entweder vollständiger Batch erfolgreich
- oder keine Teilimporte ohne explizite Freigabe

### Phase F – Protokoll
- importierte Datensätze
- übersprungene Zeilen
- manuelle Entscheidungen
- Warnungen
- Rückverweis zur Quelle

## Späterer allgemeiner Import

Ein Assistent erlaubt:
- Datei hochladen
- Blatt wählen
- Spalten zuordnen
- Vorschau
- Validierung
- Dublettenprüfung
- Import

Version 1 benötigt zuerst einen gezielten Importer für die vorhandenen Dateien.
