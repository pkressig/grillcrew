# Business Rules

## BR-000 Organisation und Tenant-Isolation

- Jede fachliche Aktion findet im Kontext genau einer Organisation statt.
- Organisationen besitzen eigene Daten, Einstellungen, Rollen, Saisons, Volunteers, Events, Familien, Auswertungen und Exporte.
- Kein Kunden-, Vereins- oder Instanzname wird im Code hart codiert.
- Logo, Farben, Anzeigename, Locale, Zeitzone und fachliche Einstellungen kommen aus der Datenbank.
- Backend-Guards pruefen immer Organisation und Rolle gemeinsam.

## BR-001 Sollstunden

- Eine Familie mit einem Kind hat standardmässig 8 Sollstunden pro Vereinsjahr.
- Eine Familie mit zwei oder mehr Kindern hat standardmässig 12 Sollstunden pro Vereinsjahr.
- Herbst und Frühling werden separat ausgewiesen.
- Für die Erfüllung zählt die Summe beider Teil-Saisons.
- Admin kann einen abweichenden Sollwert erfassen; Grund und Änderung werden protokolliert.
- Das Soll wird beim ersten fachlichen Bezug im Vereinsjahr materialisiert und danach eingefroren.
- Spätere Kinderänderungen erzeugen Admin-Handlungsbedarf statt stiller Neuberechnung.

## BR-002 Vergütungsarten

Eine bestätigte Einsatzleistung besitzt genau eine Hauptart:
- Sollstunden
- unentgeltlich
- Auszahlung

Die Art gilt pro Einsatzleistung und nicht generell pro Helfer.
Überschuss über das Familiensoll bleibt Sollstunden-Gutschrift und wird ausgewiesen; daraus entsteht kein automatischer Geldanspruch. Admin kann begründet manuell splitten.

## BR-003 Auszahlung

- Standardsatz: 9 CHF pro Stunde.
- Der Satz wird konfigurierbar gespeichert.
- Geldwerte werden in Rappen gespeichert.
- Nur bestätigte effektive Arbeitszeit wird ausbezahlt.
- Auszahlung besitzt einen nachvollziehbaren Status.
- Betrag = `round(durationMinutes * rateRappenPerHour / 60)` pro WorkRecord, kaufmännisch auf 1 Rappen.
- Der Stundensatz wird beim Freigeben der Auszahlung eingefroren.

## BR-004 Zeitberechnung

- Geplante und effektive Zeiten werden getrennt gespeichert.
- Dauer = effektives Ende minus effektiver Beginn minus Pausen.
- Über Mitternacht laufende Schichten müssen korrekt berechnet werden.
- Dauer wird intern in Minuten gespeichert.
- Korrekturen werden protokolliert.

## BR-005 Anmeldung

- Eine Schicht kann nur gebucht werden, solange ein Platz frei ist.
- Gleichzeitige Buchungen dürfen keine Überbelegung erzeugen.
- Pflichtdaten sind Name, Telefonnummer und E-Mail.
- Vollständiger Name wird öffentlich angezeigt.
- Kontaktdaten sind nicht öffentlich.
- Eine Anmeldung reserviert den Platz sofort verbindlich.
- Fehlende Einwilligung zur vollen Namensanzeige führt öffentlich zu abgekürzter Anzeige.
- Öffentliche Eintragung nutzt unsichtbaren Missbrauchsschutz: Honeypot, Mindest-Ausfüllzeit, Rate-Limits und Plausibilitätsprüfung.

## BR-006 Absage

- Selbstabsage ist bis 23:59:59 Europe/Zurich des Tages möglich, der acht Kalendertage vor dem Schichttag liegt.
- Danach zeigt die App Kontaktmöglichkeiten zur Koordination.
- Admin kann jederzeit absagen, umbuchen oder Ersatz zuweisen.
- Jede Änderung an einer veröffentlichten Anmeldung wird protokolliert.

## BR-007 Personenabgleich

Priorität:
1. verifizierte Konto-ID
2. normalisierte Telefonnummer
3. normalisierte E-Mail
4. Name nur als Hinweis für mögliche Dublette

Personen werden niemals automatisch nur aufgrund eines ähnlichen Namens zusammengeführt.

## BR-008 Familienzuordnung

- Ein Helfer kann mehreren Familienbeziehungen zugeordnet sein.
- Ein Einsatz kann für eine andere Familie geleistet werden.
- Familienzuordnung wird bei registrierten Konten erst nach Bestätigung vollständig sichtbar.
- Kinder gehören einem Familienkonto an und können Mannschaften besitzen.

## BR-009 Einsatzabschluss

- Helfer darf seine effektiven Zeiten einreichen.
- Admin bestätigt oder korrigiert.
- Papiernachträge werden als solche markiert.
- Nicht abgeschlossene Einsätze erscheinen im Admin-Handlungsbedarf.
- Anwesenheitsausgang wird auf dem Signup dokumentiert; WorkRecords enthalten nur tatsächlich geleistete Arbeit.

## BR-010 Datenschutz

- Telefonnummer und E-Mail niemals öffentlich.
- Interne Notizen niemals öffentlich.
- Kinderdaten niemals öffentlich.
- Staff sieht nur erforderliche Kontaktdaten.
- Exporte mit Kontaktdaten sind berechtigungspflichtig.
- Rollen und Rechte stehen in `docs/PERMISSIONS.md` und werden serverseitig durchgesetzt.
