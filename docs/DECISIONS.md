# Decision Log

## D-001 â€“ Erste Einsatzart
**Status:** beschlossen
Version 1 startet mit GrilleinsÃ¤tzen. Das Datenmodell verwendet allgemeine Events und Schichten, damit spÃ¤ter weitere Vereinsarbeiten ergÃ¤nzt werden kÃ¶nnen.

## D-002 â€“ Terminimport
**Status:** beschlossen
Events werden zu Beginn manuell erfasst. Ein Import aus Planungsdateien folgt spÃ¤ter.

## D-003 â€“ SchichtvorschlÃ¤ge
**Status:** beschlossen
Version 1 erlaubt manuelle Schichten und wiederverwendbare Vorlagen. Automatische VorschlÃ¤ge kÃ¶nnen spÃ¤ter aus vorhandenen Mustern entstehen.

## D-004 â€“ Pflichtdaten
**Status:** beschlossen
Vorname, Nachname, Telefonnummer und E-Mail sind bei jeder Eintragung erforderlich.

## D-005 â€“ Ã–ffentliche Sichtbarkeit
**Status:** beschlossen
VollstÃ¤ndige Namen eingetragener Helfer sind im Ã¶ffentlichen Plan sichtbar. Telefonnummern und E-Mail-Adressen sind nur fÃ¼r berechtigte Staff- und Adminrollen sichtbar.

## D-006 â€“ Absagefrist
**Status:** beschlossen
SelbststÃ¤ndige Absage ist bis sieben volle Tage vor Schichtbeginn mÃ¶glich. Danach muss die Koordination kontaktiert werden.

## D-007 â€“ Registrierung
**Status:** beschlossen
Helfer dÃ¼rfen sich ohne Konto eintragen. Ein freiwilliges Konto ermÃ¶glicht DatenÃ¼bernahme, eigene EinsÃ¤tze und Stundenansicht.

## D-008 â€“ VergÃ¼tungsart
**Status:** beschlossen
VergÃ¼tungsart wird pro Einsatz gewÃ¤hlt. Die Wahl kann vorlÃ¤ufig bei der Eintragung und endgÃ¼ltig nach dem Einsatz bestÃ¤tigt werden.

## D-009 â€“ Saisonstruktur
**Status:** beschlossen
Herbst und FrÃ¼hling sind separat sichtbar und werden in einem Vereinsjahr gemeinsam ausgewertet.

## D-010 â€“ Einsatzabschluss
**Status:** beschlossen
Der Helfer kann effektive Zeiten selbst erfassen. Admin kann Daten aus Papierlisten nachtragen oder korrigieren.

## D-011 â€“ Familienkonto
**Status:** beschlossen
Mehrere Helfer kÃ¶nnen Stunden fÃ¼r dieselbe Familie leisten. Helfer und begÃ¼nstigte Familie sind getrennte Objekte.

## D-012 â€“ Sollstunden
**Status:** beschlossen
Standard pro Vereinsjahr: ein Kind 8 Stunden, zwei oder mehr Kinder 12 Stunden.

## D-013 â€“ Eigene Koordinationszeit
**Status:** beschlossen
Die Koordinationsarbeit wird in der App erfasst und ist nur fÃ¼r Admin sichtbar.

## D-014 â€“ Sprache
**Status:** beschlossen
Version 1 ist deutsch. Die technische Struktur wird von Anfang an Ã¼bersetzbar aufgebaut.

## D-015 â€“ Produktumfang
**Status:** beschlossen
Ueberholt durch D-033 und D-034. Das Produkt ist eine kommerzielle Multi-Organization-SaaS-Plattform. Die erste produktive Organisation ist ein Pilotkunde, nicht die Produktgrenze.

## D-016 â€“ Hosting
**Status:** beschlossen
Entwicklung zunÃ¤chst lokal. Produktivbetrieb spÃ¤ter bei einem Hostinganbieter mit HTTPS, E-Mail-Versand und Backups.

## D-017 â€“ Produktname
**Status:** beschlossen
Ueberholt durch D-033 und D-035. Produkt- und Organisationsnamen duerfen nicht im Code hart codiert werden. Jede Organisation liefert Anzeigename und Branding aus der Datenbank.

## D-018 â€“ Staff-Zugriff
**Status:** beschlossen
Staff umfasst Kioskteam, Grillkoordination, Vorstand und weitere berechtigte Verantwortliche. Der Zugriff wird rollenbasiert und mÃ¶glichst auf notwendige Daten begrenzt.

## D-019 â€“ Erscheinungsstatus
**Status:** beschlossen
Admin kann erschienen, entschuldigt abgesagt, kurzfristig abgesagt, nicht erschienen und Ersatz organisiert dokumentieren.

## D-020 â€“ Quelle der Wahrheit
**Status:** beschlossen
Das Repository ist die Single Source of Truth. Produktentscheidungen werden dokumentiert, bevor sie umgesetzt werden.

## D-021 â€“ Anwesenheitsstatus
**Status:** beschlossen
Entspricht RFC-001 Option C. Der Ausgang einer Anmeldung liegt auf `Signup.outcome`. Ein `WorkRecord` beschreibt nur tatsÃ¤chlich geleistete, bezifferbare Arbeit und verweist verpflichtend auf ein Signup. RÃ¼ckwirkende Papier- und ImportnachtrÃ¤ge erzeugen synthetische Admin- bzw. Import-Signups ohne Ã¶ffentliche Nebenwirkungen.

## D-022 â€“ Ã–ffentliche Reservierung
**Status:** beschlossen
Entspricht RFC-002 Option A. Eine Ã¶ffentliche Anmeldung reserviert den Platz sofort verbindlich. Die BestÃ¤tigungs-E-Mail informiert und enthÃ¤lt den Verwaltungslink; unzustellbare E-Mails erscheinen im Admin-Handlungsbedarf.

## D-023 â€“ Ãœberschussstunden
**Status:** beschlossen
Entspricht RFC-003 Option A mit manueller Admin-Split-Kompetenz. Ãœberschuss Ã¼ber das Familiensoll ist erlaubt und wird ausgewiesen; daraus entsteht kein automatischer Geldanspruch. Admin darf im Korrekturweg einen Einsatz manuell auf mehrere WorkRecords aufteilen.

## D-024 â€“ Sollstunden-Einfrieren
**Status:** beschlossen
Entspricht RFC-004 Option C. Das Familiensoll wird beim ersten fachlichen Bezug im Vereinsjahr materialisiert und danach eingefroren. SpÃ¤tere KinderÃ¤nderungen erzeugen Admin-Handlungsbedarf; Ã„nderungen erfolgen per begrÃ¼ndetem Override.

## D-025 â€“ Staff-Rollenmodell
**Status:** beschlossen
Entspricht RFC-005 Option B. Version 1 verwendet die Rollen `ADMIN`, `KOORDINATION`, `KIOSK` und `VORSTAND_LESEN` mit fester serverseitiger Rechtematrix gemÃ¤ss `docs/PERMISSIONS.md`.

## D-026 â€“ Status-Enums
**Status:** beschlossen
Entspricht RFC-006 Option A. Gespeichert werden nur nicht ableitbare Status. Technische Enum-Werte sind Englisch; deutsche UI-Labels kommen aus der Ãœbersetzungsschicht. Belegungsanzeigen wie "voll" oder "noch 1 Platz frei" werden berechnet.

## D-027 â€“ Ã–ffentliche Namensanzeige
**Status:** beschlossen
Entspricht RFC-007 Option A. `Volunteer.publicDisplayConsentAt` dokumentiert die Einwilligung zur vollen Ã¶ffentlichen Namensanzeige. Ohne Einwilligung zeigt der Ã¶ffentliche Plan nur eine abgekÃ¼rzte Namensform; Staff und Admin sehen berechtigte Detaildaten.

## D-028 â€“ Rundung von Auszahlungen
**Status:** beschlossen
Entspricht RFC-008 Option A. AuszahlungsbetrÃ¤ge werden pro WorkRecord kaufmÃ¤nnisch auf 1 Rappen gerundet und gespeichert. Der Stundensatz wird beim Freigeben der Auszahlung in `Payment.rateRappenPerHour` eingefroren.

## D-029 â€“ Sieben-Tage-Absageregel
**Status:** beschlossen
Entspricht RFC-009 Option B. Selbstabsage ist bis 23:59:59 Europe/Zurich des Tages mÃ¶glich, der acht Kalendertage vor dem Schichttag liegt. Die App zeigt immer das konkrete Fristdatum und danach die Koordinationskontakte.

## D-030 â€“ Missbrauchsschutz
**Status:** beschlossen
Entspricht RFC-010 Option A. Ã–ffentliche Eintragungen werden mit unsichtbaren Massnahmen geschÃ¼tzt: Honeypot, Mindest-AusfÃ¼llzeit, serverseitige Rate-Limits pro IP und Kontakt sowie PlausibilitÃ¤tsprÃ¼fung. Grenzwerte sind Organisationseinstellungen.

## D-031 â€“ Technologie-Stack
**Status:** beschlossen
Der Product Owner bestÃ¤tigt den Stack: Next.js Frontend, FastAPI Backend und PostgreSQL Datenbank. Zielplattformen fÃ¼r die Cloud-Vorbereitung sind Vercel fÃ¼r `frontend/` sowie Render fÃ¼r Backend und PostgreSQL.

## D-032 â€“ Revidierter Sprint-1-Umfang
**Status:** beschlossen
Sprint 1 ist bewusst nur das technische Fundament: Repository-Struktur, lokale Entwicklung, CI, Datenbank/Migrationen, Healthchecks, Basis-Konfiguration, Tests, Deployment-Vorbereitung und dokumentierte Architektur. Produktfunktionen aus Sprint 2 und spÃ¤ter werden nicht vorgezogen.

## D-033 – Kommerzielles SaaS-Produkt
**Status:** beschlossen
Das Produkt ist eine kommerzielle SaaS-Plattform fuer mehrere Organisationen. Keine Organisation, kein Verein und kein Instanzname ist Produktgrenze oder Code-Konstante. Die erste produktive Organisation dient als Pilotkunde.

## D-034 – Multi-Organization-Tenancy
**Status:** beschlossen
Alle fachlichen Daten sind organisationsgebunden. Jede Organisation besitzt eigene Einstellungen, Rollen, Saisons, Volunteers, Events, Shifts, Signups, Familien, WorkRecords, Payments, Statistiken und Exporte. Backend-Queries muessen immer auf den aktuellen Organization-Kontext eingeschraenkt sein.

## D-035 – Datenbankgetriebenes Branding
**Status:** beschlossen
Logo, Farben, Anzeigename, Locale, Zeitzone und weitere Organisationskonfiguration kommen aus der Datenbank. Frontend und Backend duerfen keine kundenspezifischen Markenwerte hart codieren. Oeffentliche Seiten laden Branding ueber den Organization-Kontext.

## D-036 – F001 Organization Context
**Status:** beschlossen
F001 implementiert noch keine Authentifizierung. Oeffentliche Organization-Aufloesung erfolgt in dieser Reihenfolge: Custom Domain, Subdomain, URL-Pfad, Development-Override `?org=`. Nur in `APP_ENV=development` darf auf genau eine vorhandene Organisation zurueckgefallen werden; in Produktion gibt es keinen Fallback. Der erste Kunde darf als Seed-Datensatz in der Migration angelegt werden; Anwendungscode, UI-Texte, Tests und Konfiguration bleiben organisation-agnostisch.

## D-037 – Plattform-Operator-Repraesentation
**Status:** beschlossen
Ein Platform Operator wird ueber ein nullable Feld `User.platformRole` (Enum, in Version 1 einziger Wert `PLATFORM_OPERATOR`) abgebildet. Das Feld ist ueber keine oeffentliche und keine organisationsbezogene Admin-API beschreibbar; die Vergabe erfolgt ausschliesslich ueber einen kontrollierten Platform-Admin-Prozess ausserhalb der regulaeren Anwendungs-Endpunkte. Organisationsbezogene Rollen bleiben ausschliesslich in `StaffMembership` abgebildet; `platformRole` ist von `StaffMembership` unabhaengig und ersetzt sie nicht. Entspricht F002_DECISIONS.md P-1.

## D-038 – Authentifizierungs-Rate-Limits
**Status:** beschlossen
Rate-Limits fuer sicherheitsrelevante Authentifizierungsaktionen (Login, Token-Refresh, Passwort-Reset-Anfrage, Einladungsannahme und weitere sensible Auth-Aktionen) sind plattformweit und werden ueber umgebungsvariablengetriebene `Settings`-Felder konfiguriert, mit konservativen Standardwerten und je Aktion einem eigenen Grenzwert. Diese Grenzwerte werden in Version 1 nicht in `OrganizationSettings` und nicht in einer neuen Datenbanktabelle gespeichert. Entspricht F002_DECISIONS.md P-2.

## D-039 – Cross-Site-Cookies, CORS und CSRF
**Status:** beschlossen
Access- und Refresh-Token werden als `HttpOnly`, `Secure` Cookies uebertragen; solange Frontend und Backend auf unterschiedlichen Sites liegen, gilt `SameSite=None`. Erlaubte Urspruenge (CORS) werden dynamisch aus der Datenbank aufgeloest (freigegebene Plattform- und Organisationsdomains); Wildcard-Origins in Kombination mit Credentials sind ausdruecklich verboten. `Origin` und `Host` werden bei jeder Anfrage konsistent geprueft; fehlende, abweichende oder nicht freigegebene Werte fuehren zur Ablehnung. Jede zustandsaendernde, cookie-authentifizierte Anfrage erfordert zusaetzlich einen CSRF-Schutz nach der in `docs/F002_PLAN.md` beschriebenen Double-Submit-Token-Strategie (signiertes, an die Session gebundenes Token, uebertragen im Custom-Header). Eine zukuenftige Same-Site-BFF-/Custom-Domain-Architektur bleibt im Backlog. Entspricht F002_DECISIONS.md P-3.

## D-040 – E-Mail-Versand fuer Einladung und Passwort-Reset
**Status:** beschlossen
Transaktionale E-Mails (Passwort-Reset, Staff-Einladungen) laufen ueber eine anbieterunabhaengige `EmailSender`-Abstraktion. Die konkrete Transportart in Version 1 ist SMTP, konfiguriert ausschliesslich ueber Umgebungsvariablen; der Versand erfolgt asynchron ueber FastAPI `BackgroundTasks`, ohne zusaetzlichen Broker oder Worker-Prozess. Fehlgeschlagene Sendeversuche werden protokolliert, sind fuer Operatoren sichtbar und sicher wiederholbar; Passwort-Reset- und Einladungs-Token bleiben auch bei fehlgeschlagenem Versand sicher (kurzlebig, einmal verwendbar, nur als Hash gespeichert). Rohtoken und Geheimnisse werden niemals geloggt. Entspricht F002_DECISIONS.md P-4.

## D-041 - Spielplan-Import und Grill-Workflow-Digitalisierung
**Status:** beschlossen (2026-07-30)

Grundlage: Analyse realer FCTC-Excel-Dateien (Heimspielplan-Export, Kiosk-/Grillplan, Grilleinsatzplan,
Saisonabschluss-Auswertung) und direkte Produktentscheidungen mit dem Product Owner. Ziel ist die
vollstaendige Abloesung des bisherigen externen Tools ("VolunteerSignup") durch GrillCrew, beginnend
mit dem Grill-Kernworkflow; Kiosk wird architektonisch vorbereitet, aber separat umgesetzt.

1. Crew-Groesse/Menue wird durch eine organisationsweit konfigurierbare Regel-Engine vorgeschlagen
   (Team-Textmuster -> Menuetyp -> benoetigte Grilleranzahl + Mindestanzahl Spiele je Schicht), immer
   als editierbarer Vorschlag, nie stillschweigend uebernommen. Ein nicht loeschbarer Standardfall
   (`pattern = null`) garantiert immer ein Ergebnis.
2. Nur explizit konfigurierte, aktive Heimplaetze (initial "Cazis / St. Martin") gelten als
   Grill-/Kiosk-Standort; die Zuordnung ist eine organisationsweite Einstellung mit Vorschau und
   manuellem Override pro importiertem Spiel, kein hartcodierter Wert.
3. Alle Spieltypen (Meisterschaft, Cup, Test-/Trainingsspiele, Turnier) werden importiert, sofern am
   Heimplatz; ob daraus ein Grill-Einsatz entsteht, entscheidet die Koordination pro Spiel manuell.
4. Re-Import erzeugt eine ueberpruefbare 5-Wege-Diff-Vorschau (neu/geaendert/verschoben/entfernt/
   unveraendert). Abgleich ueber die Spielnummer des Verbands, ersatzweise ueber Team-Paarung + Datum,
   wenn keine Spielnummer vorliegt. Nichts wird beim Re-Import blind ueberschrieben.
5. Eine Spielverschiebung nach bereits erfolgten Anmeldungen loest keine automatische
   Schichtverschiebung aus; sie wird nur angezeigt, die Koordination kontaktiert betroffene Helfer
   manuell ausserhalb der App. Ein Werkzeug zur Nachrichtengenerierung (z. B. fuer WhatsApp) bleibt
   Backlog.
6. Die Zuordnung einer Schicht zu einem Kind/einer Familie ist optional und erfolgt typischerweise
   nachtraeglich (oft erst am Saisonende), nie als Pflichtfeld beim Signup. Sie gehoert auf eine
   kuenftige eigenstaendige `WorkRecord`-Entitaet, nicht auf `Signup` selbst (`Signup` hat und erhaelt
   keine Verguetungs- oder Familienfelder).
7. Kiosk wird architektonisch vorbereitet (gemeinsames Event-/Schicht-Fundament, kuenftige
   Unterscheidung Grill/Kiosk und offene/feste Zuteilung je Schicht), aber als eigenstaendiges Modul
   separat umgesetzt; feste Zuteilung durch die Koordination statt offenem Self-Signup.
8. Auszahlung bleibt in Version 1 papierbasiert (Unterschrift auf Papier); die App dokumentiert nur
   Verguetungsart, Betrag, Auszahlungsstatus und einen manuellen "Unterschrift erhalten"-Vermerk
   (Zeitstempel, bestaetigende Person). Eine digitale Unterschrift bleibt Backlog.
9. Die Arbeitszeit der Grill-/Kiosk-Koordination wird ausbezahlt und als eigener, ADMIN-only
   Datensatz (kein Helfer-Signup/-WorkRecord) mit eigenem Stundensatz erfasst.
10. Der Saisonend-Report enthaelt mindestens Helfername, Familie, zugeordnetes Kind (falls
    vorhanden), geleistete Stunden, Sollstunden, Differenz, Erfuellungsstatus,
    unentgeltlich/ausbezahlt-Aufteilung, Auszahlungsbetrag und offene Zuordnungen; Export zunaechst
    als CSV/XLSX, PDF folgt spaeter.
11. Die Rundung des Auszahlungsbetrags folgt der bereits ratifizierten Regel BR-003/D-028
    (kaufmaennisch auf 1 Rappen); keine neue Rundungsregel noetig.

**Umsetzungsstand:** Phase 1 (Settings-Fundament) und Phase 2 (Spielplan-Import) sind gemerged
(Commits `b1599202940a2898aa299651fcbebcf16b47063b` und
`3757d1cf11c93e96772bbaa064a803032b30f36b`). Phase 3 (Crew-Vorschlag in der Schichterstellung,
`Shift.shift_type`/`assignment_mode`/`menu_type`/`crew_suggestion_overridden`, Kiosk-Vorbereitung)
ist lokal implementiert und getestet (siehe `docs/FEATURES.md` F015) — ab dieser Phase kann die
Saison vollständig ohne VolunteerSignup laufen (Import → Schicht mit Crew-Vorschlag → bestehendes
offenes Signup). Phasen 1-3 wurden zusätzlich end-to-end gegen eine lokale PostgreSQL-Instanz und im
echten Browser gegen den realen Verbandsexport `Spielbetrieb - Kiosk.xlsx` (Saison 2026/27) verifiziert:
Login, Übersicht, Planung, Familien, Anwesenheit, Einstellungen (Heimplätze/Crew-Regeln), Import
(171 Zeilen, 123 als `Event` übernommen) und die Crew-Vorschlag-Schichterstellung funktionieren alle
gegen echte Daten. Diese Verifikation deckte zwei reale Parser-Lücken auf, die behoben wurden (siehe
`docs/DATA_MODEL.md`s `ImportRow`-Abschnitt): `SpielTyp` wird jetzt per erkanntem Präfix statt exakter
Gleichheit gematcht (der Verband hängt Turnier-Freitext an, z. B. "Turnier Junior*innen E-F-G / Brack
play more football"), und "keine" wird wie "Ohne" als Spielnummer-Platzhalter erkannt (das Kiosk-
Export-Format des Vereins nutzt diese abweichende Schreibweise). Phase 4A (rückwirkende
Kind-Zuordnung und Vergütungsklassifikation pro Signup) ist lokal implementiert und getestet: die
neue `WorkRecord`-Entität (`docs/DATA_MODEL.md`) erlaubt ADMIN/KOORDINATION, ein `ATTENDED`-Signup
nachträglich einem `CHILD`-Familienmitglied zuzuordnen oder explizit unzugeordnet zu lassen, und es
als `WORK_HOURS`, `VOLUNTARY` oder `PAYOUT` zu klassifizieren; `PAYOUT` berechnet den Betrag
kaufmännisch gerundet (BR-003/D-028) aus dem aktuellen Auszahlungssatz und verfolgt einen
`payoutStatus` (`OPEN`/`APPROVED`/`PAID`, nur ADMIN darf weiterschalten) sowie einen manuellen
"Unterschrift erhalten"-Vermerk (Zeitstempel, bestätigende Person) statt einer digitalen
Unterschrift, gemäss Punkt 8. Die Anwesenheits-Admin-Ansicht zeigt dies als "Nachträgliche
Zuordnung" pro abgeschlossenem Eintrag; öffentliche Seiten bleiben unverändert. Phase 4B
(Koordinationszeit) ist lokal implementiert. Saisonreport und Kiosk-Modul bleiben spaetere Phasen.

Phase 4B ergaenzt Koordinationszeit als separaten, privaten ADMIN-Datensatz ohne Bezug zu Signup,
Shift, Volunteer oder WorkRecord. Datum, positive Dauer, eigener Stundensatz in Rappen und Notiz
werden waehrend `OPEN` gepflegt. Der berechnete Betrag wird pro Datensatz kaufmaennisch auf einen
Rappen gerundet; der eingegebene Satz ist der persistierte Snapshot und wird zusammen mit den
Finanzfeldern ab `APPROVED` unveraenderlich. Status folgen `OPEN -> APPROVED -> PAID`. Die
Papierunterschrift wird nur als manueller Empfangsvermerk mit optionaler Notiz dokumentiert.

**Non-Goals (vorerst):** automatische Schichtverschiebung, digitale Unterschrift, KI-gestuetzte
Besetzungsvorschlaege (Gemini), WhatsApp-Versandintegration, Sollstunden-Materialisierung
(`FamilyRequirement`) - alle in `docs/BACKLOG.md` erfasst.
