# UX- und UI-Regeln

## Ziel

Eine Person ohne Vorkenntnisse soll innerhalb weniger Sekunden erkennen:
- welche Schichten frei sind
- wie sie sich einträgt
- ob die Eintragung erfolgreich war

Admin soll beim Öffnen sofort sehen:
- wo Helfer fehlen
- welche Einsätze nachbearbeitet werden müssen
- welche Auszahlungen offen sind

## Mobile First

Die öffentliche Oberfläche wird zuerst für schmale Smartphone-Ansichten entwickelt. Desktop erweitert die Darstellung, verändert aber nicht den Grundablauf.

## Öffentlicher Ablauf

1. Einsatzplan öffnen
2. freie Schicht auswählen
3. Pflichtdaten erfassen
4. Vergütungsart für diese Schicht wählen
5. Datenschutz und öffentliche Namensanzeige bestätigen
6. Eintragung abschliessen
7. Bestätigung mit Kalender- und Verwaltungslink

Maximal ein klarer Hauptbutton pro Bildschirm.

## Eventkarte

Zeigt:
- Wochentag und Datum
- Titel/Anlass
- Ort
- Schichtzeit
- Belegung
- vollständige Namen bereits eingetragener Helfer
- Status
- Hauptaktion

Beispiele:
- `Noch 1 Platz frei`
- `Vollständig besetzt`
- `Anmeldung geschlossen`
- `Termin verschoben`

## Barrierearme Standards

- Touch-Ziele mindestens 44 × 44 px
- Grundschrift nicht kleiner als 16 px auf mobilen Formularen
- klare Fehlertexte direkt beim Feld
- keine Information nur durch Farbe
- sichtbarer Tastaturfokus
- korrekte Labels und semantisches HTML
- verständliche deutsche Begriffe statt Fachsprache

## Admin-Navigation

Primär:
- Übersicht
- Einsätze
- Helfer
- Familien
- Auswertung
- Mehr/Einstellungen

Auf kleinen Geräten als Bottom-Navigation oder klarer kompakter Navigator.

## Tabellen

Keine dogmatische Tabellenvermeidung:
- auf Mobilgeräten Karten und kompakte Listen
- auf Desktop bei Massendaten echte Tabellen mit Suche, Filter und Bulk-Aktionen
- keine horizontal unbedienbaren Riesentabellen auf dem Handy

## Statusfarben

Vereinsfarben für Branding. Fachstatus zusätzlich:
- Erfolg/besetzt
- Warnung/fast voll oder bald fällig
- Fehler/offen oder problematisch
- neutral/Entwurf

Farben werden erst nach Übernahme des offiziellen Logos final festgelegt.

## Tonalität

Freundlich, direkt, nicht bürokratisch.

Beispiel:
- gut: `Für diese Schicht fehlt noch 1 Person.`
- schlecht: `Personalbedarf nicht vollständig gedeckt.`

## Datenschutzanzeige

Bei Eintragung sichtbar:
`Dein Vor- und Nachname wird im öffentlichen Einsatzplan angezeigt. Telefonnummer und E-Mail sehen nur berechtigte Verantwortliche.`
