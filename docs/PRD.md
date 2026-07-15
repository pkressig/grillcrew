# Product Requirements Document

## 1. Produkt

**Name der Vereinsinstanz:** GrillCrew FCTC

GrillCrew FCTC ist eine moderne, mobile Web-App zur Organisation freiwilliger Grilleinsätze. Die erste Version wird für den FC Thusis-Cazis gebaut. Das Datenmodell soll weitere Einsatzarten später ermöglichen, ohne Version 1 unnötig zu vergrössern.

## 2. Problem

Der aktuelle Ablauf verteilt sich auf:
- Kiosk- und Heimspielplan
- VolunteerSignup
- WhatsApp-Kommunikation
- Monatspläne auf Papier
- Unterschriften und handschriftliche Nachträge
- mehrere Excel-Dateien für Einsatz-, Stunden- und Familienauswertungen

Die Folgen sind:
- doppelte Datenpflege
- Telefonnummern und Namen in verschiedenen Schreibweisen
- manuelle Kontrolle offener Plätze
- aufwendiges Nachführen bei Spielverschiebungen
- manuelle Berechnung von Sollstunden, unentgeltlichen Stunden und Auszahlungen
- fehlende zentrale Helfer- und Familienhistorie

## 3. Zielgruppen

### Helfer
Eltern, Vereinsmitglieder und weitere freiwillige Personen. Unterschiedliche Altersgruppen und technische Erfahrung.

### Staff
Kioskteam, Grillkoordination, Vorstand oder weitere berechtigte Verantwortliche.

### Admin
Grillkoordination. Vollständige Planung, Verwaltung, Korrektur, Auswertung und Import.

## 4. Kernablauf

1. Admin erstellt Vereinsjahr, Teil-Saison, Event und Schichten.
2. Admin veröffentlicht den Plan und teilt Link oder QR-Code.
3. Helfer sieht Termine und freie Plätze ohne Login.
4. Helfer trägt sich mit Vorname, Nachname, Telefonnummer und E-Mail ein.
5. Helfer wählt pro Schicht vorläufig die Vergütungsart:
   - Sollstunden
   - unentgeltlich
   - Auszahlung
6. Bei Sollstunden wird eine Familie ausgewählt oder zur Prüfung angegeben.
7. Helfer erhält Bestätigung und kann optional ein Konto anlegen.
8. Bis sieben Tage vor Beginn kann der Helfer selbst absagen.
9. Innerhalb von sieben Tagen wird Kontakt mit der Koordination verlangt.
10. Nach dem Einsatz erfasst der Helfer effektive Zeiten und bestätigt die Angaben.
11. Admin kann Papierangaben nachtragen oder jede Angabe korrigieren.
12. Die App berechnet Stunden, Sollstände und Auszahlungen.
13. Admin exportiert Saison- und Vereinsjahresauswertungen.

## 5. Version-1-Funktionen

### 5.1 Öffentlicher Einsatzplan
- kommende Events und Schichten
- Datum, Zeit, Ort, Beschreibung
- benötigte und belegte Plätze
- vollständige Namen eingetragener Helfer
- keine öffentlichen Telefonnummern oder E-Mail-Adressen
- Filter nach Zeitraum und offenen Plätzen
- grosse Schaltfläche zur Eintragung

### 5.2 Eintragung ohne Konto
Pflichtfelder:
- Vorname
- Nachname
- Telefonnummer
- E-Mail
- Vergütungsart für diesen Einsatz

Zusätzlich:
- Familienzuordnung bei Sollstunden
- Bemerkung optional
- Zustimmung zur Datenverarbeitung und öffentlichen Namensanzeige
- Bestätigung per E-Mail
- sicherer persönlicher Verwaltungslink

### 5.3 Optionales Helferkonto
- Registrierung ist freiwillig
- bestehende Einsätze können nach verifizierter E-Mail und Telefonnummer übernommen werden
- persönliche Stammdaten werden vorbefüllt
- eigene kommende und vergangene Einsätze
- eigenes Stundenkonto
- bestätigte Familienzuordnung zeigt gemeinsames Familienkonto
- Magic Link oder Einmalcode statt komplizierter Passwortpflicht bevorzugt

### 5.4 Saisons
- Vereinsjahr, z. B. 2026/2027
- Teil-Saisons Herbst und Frühling
- getrennte Auswertung
- gemeinsame Auswertung über das Vereinsjahr
- Status: Entwurf, aktiv, abgeschlossen, archiviert

### 5.5 Events und Schichten
Event:
- Titel
- Datum
- Ort
- öffentliche Beschreibung
- interne Notiz
- Eventtyp
- Status
- optionale Hinweise wie Turnier oder Spezialbetrieb

Schicht:
- geplante Start- und Endzeit
- benötigte Helferzahl
- Status
- öffentlicher Hinweis
- interne Notiz
- mehrere Helferplätze
- Vergütungswahl je Anmeldung

### 5.6 Admin-Dashboard
Priorität ist Handlungsbedarf:
- offene Plätze in 7, 14 und 30 Tagen
- kurzfristige Absagen
- unbestätigte oder unvollständige Einsätze
- fehlende Familienzuordnungen
- mögliche Dubletten
- offene Auszahlungen
- heutige und nächste Einsätze
- schneller WhatsApp-Teiltext für offene Schichten

### 5.7 Helferverwaltung
- vollständige Kontaktdaten
- Einsatzhistorie
- Konto vorhanden/nicht vorhanden
- Familienzuordnungen
- Status und interne Notizen
- sachliche Ereignisstatus:
  - erschienen
  - entschuldigt abgesagt
  - kurzfristig abgesagt
  - nicht erschienen
  - Ersatz organisiert
- mögliche Dubletten manuell zusammenführen

### 5.8 Familien und Kinder
- gemeinsames Familienkonto
- mehrere erwachsene Helfer pro Familie
- mehrere Kinder pro Familie
- Mannschaft optional
- Sollstunden pro Vereinsjahr
- Standard:
  - ein Kind: 8 Stunden
  - zwei oder mehr Kinder: 12 Stunden
- Admin kann Sollwert begründet überschreiben
- Stunden können von einer anderen Person für eine Familie geleistet werden

### 5.9 Einsatzabschluss
- effektiver Arbeitsbeginn
- effektives Arbeitsende
- Pausen optional
- berechnete Dauer
- endgültige Vergütungsart
- begünstigte Familie bei Sollstunden
- Helferbestätigung
- Admin-Korrektur mit Änderungsprotokoll
- Nachtrag von Papierlisten

### 5.10 Auszahlung
- Standardsatz 9 CHF pro Stunde, administrativ änderbar
- Betrag automatisch aus bestätigter Dauer berechnen
- Status: offen, freigegeben, ausbezahlt
- Auszahlungsdatum
- interne Bemerkung
- Saison- und Gesamtauswertung

### 5.11 Eigene Koordinationszeit
Nur Admin sichtbar:
- Datum
- Tätigkeit
- Dauer
- Teil-Saison
- Bemerkung
- Status
- Berechnung mit hinterlegtem Stundenansatz

### 5.12 Staff
- Staff sieht vollständige Namen und Telefonnummern
- Staff sieht nur Daten, die für seine Arbeit erforderlich sind
- Rollen werden detailliert in Berechtigungen umgesetzt
- Vorstand kann später eine Lese-/Exportrolle erhalten
- Admin besitzt Vollzugriff

### 5.13 Kommunikation
Version 1:
- E-Mail-Bestätigung
- E-Mail-Erinnerung
- klickbare Telefon- und WhatsApp-Links für Staff
- vorbereitete WhatsApp-Texte zum Teilen
- Kalenderdatei
- Änderungsinformation bei verschobenen Events

Nicht Version 1:
- automatische WhatsApp-Business-API
- kostenpflichtige SMS
- native Push-Nachrichten

### 5.14 Import und Export
Import:
- einmalige Übernahme der vier bestehenden Excel-Dateien
- später allgemeiner Import-Assistent
- Vorschau, Dublettenprüfung, Spaltenzuordnung und Protokoll

Export:
- Excel/CSV für Stunden, Familien und Auszahlungen
- Monats-/Einsatzplan
- druckfreundliche Staff-Liste
- Saisonabschluss
- Vereinsjahresübersicht

## 6. Nichtfunktionale Anforderungen

- mobile-first PWA
- moderne, schnelle Benutzeroberfläche
- für ältere Personen gut bedienbar
- gute Kontraste und grosse Touch-Ziele
- responsive für Handy, Tablet und Desktop
- deutsche Oberfläche, Internationalisierung vorbereitet
- Hosting in einer professionellen Umgebung
- lokale Entwicklung möglich
- sichere Rollen- und Rechteprüfung
- revisionsfähiges Änderungsprotokoll für relevante Daten
- tägliche Backups im Produktivbetrieb
- Europe/Zurich als fachliche Zeitzone

## 7. Erfolgskriterien der ersten Saison

- alle Grilltermine werden in der App geführt
- Helfer können sich ohne Erklärung selbst eintragen
- Telefonnummern sind für Staff erreichbar, aber nie öffentlich
- offene Schichten sind sofort erkennbar
- Saisonabschluss benötigt keine manuelle Neuberechnung in mehreren Excel-Dateien
- bestehende Helfer- und Familiendaten sind bereinigt übernommen
