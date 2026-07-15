# Berechtigungen

## Rollen

Die Rollen sind in D-025 beschlossen und werden serverseitig durchgesetzt.

- `ADMIN`: Vollzugriff für Grillkoordination und technische Administration.
- `KOORDINATION`: operative Planung und Einsatzkoordination ohne technische Systemverwaltung.
- `KIOSK`: Einsicht in einsatzrelevante Staff-Informationen für aktuelle und kommende Schichten.
- `VORSTAND_LESEN`: lesender Zugriff auf Auswertungen und berechtigte Exporte.

## Rechtematrix

| Bereich | ADMIN | KOORDINATION | KIOSK | VORSTAND_LESEN |
|---|---:|---:|---:|---:|
| Organisationseinstellungen verwalten | ja | nein | nein | nein |
| Staff-Rollen vergeben | ja | nein | nein | nein |
| Vereinsjahre, Saisons, Events, Schichten verwalten | ja | ja | nein | nein |
| Plan veröffentlichen oder schliessen | ja | ja | nein | nein |
| Öffentlichen Plan ansehen | ja | ja | ja | ja |
| Helfer-Kontaktdaten für Einsätze sehen | ja | ja | ja, einsatzbezogen | nein |
| Helfer-Stammdaten verwalten | ja | ja | nein | nein |
| Familien, Kinder und Sollwerte verwalten | ja | ja | nein | nein |
| Einsatzabschluss erfassen oder korrigieren | ja | ja | nein | nein |
| Papiernachträge erfassen | ja | ja | nein | nein |
| Auszahlungen freigeben oder als bezahlt markieren | ja | nein | nein | nein |
| Koordinationszeit sehen und verwalten | ja | nein | nein | nein |
| Admin-Handlungsbedarf bearbeiten | ja | ja | nein | nein |
| Staff-Liste für aktuelle Einsätze ansehen | ja | ja | ja | nein |
| Statistiken und Saisonberichte ansehen | ja | ja | nein | ja |
| Exporte ohne Kontaktdaten erzeugen | ja | ja | nein | ja |
| Exporte mit Kontaktdaten erzeugen | ja | ja, falls erforderlich | nein | nein |
| Import aus Bestandsdaten ausführen | ja | nein | nein | nein |
| Audit-Log ansehen | ja | nein | nein | nein |

## Grundsätze

- Telefonnummern und E-Mail-Adressen sind niemals öffentlich.
- Kinderdaten sind niemals öffentlich.
- Jede Rolle sieht nur Daten, die für ihre Aufgabe erforderlich sind.
- Frontend-Ausblendungen sind nur Komfort; verbindlich sind Backend-Guards.
