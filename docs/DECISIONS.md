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
**Status:** ersetzt durch D-046 (2026-08-03)
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
## Planning-period lifecycle

Club years and seasons use `DRAFT → ACTIVE → CLOSED → ARCHIVED` lifecycle states. ADMIN and KOORDINATION may edit open periods and close/archive them. Hard deletion of a planning period is deliberately limited to unused drafts after server-side dependency checks. The only active season cannot be closed until another active season exists. D-045 defines the deliberately separate deletion rule for one terminal Event.
## D-042 – Abgeleitete Kiosk-/Grillvorschläge (Phase 1)

**Entscheid:** Kioskfenster werden für Spiele an aktiven Heimplätzen mit 30 Minuten Vor- und Nachlauf abgeleitet. Nur Abstände von mehr als 240 Minuten trennen Fenster. Grillbedarf bleibt Teil dieses Vorschlags: standardmässig ein Platz bis drei gleichzeitig abgedeckten Spielen, sonst zwei; eine passende CrewSizeRule kann die Anzahl übersteuern. Manuelle Änderungen werden separat, mandantenbezogen und auditiert gespeichert.

**Abgrenzung:** Vorschläge erzeugen weder Schichten noch öffentliche Anmeldungen. Ein externer Kioskplan wird in dieser Phase nicht importiert.
# D-044: OneDrive-Spielplanquelle bleibt strikt lesend

Die ADMIN-Konfiguration speichert nur einen validierten OneDrive-/SharePoint-HTTPS-Link, Zeitplan und Datumsfilter, niemals Zugangsdaten. Manuelle und fällige Läufe dürfen ausschliesslich per HTTP GET herunterladen und erzeugen einen prüfbaren `STAGED`-Import; Bestätigung und Event-Mutationen bleiben ein separater Admin-Schritt. Microsoft-Schreibscopes und Schreib-APIs sind ausgeschlossen. Ohne persistenten Worker ruft die Produktion den idempotenten `run-due`-Endpunkt täglich nach der konfigurierten Zeit auf.

## D-045 – Explizites endgültiges Löschen eines historischen Anlasses

ADMIN und KOORDINATION dürfen genau einen `COMPLETED`- oder `CANCELLED`-Anlass im Archiv nach
Eingabe von `ANLASS_ENDGUELTIG_LOESCHEN` endgültig löschen. Die transaktionale Aktion entfernt nur
die dem Anlass exklusiv gehörenden Einsätze, Anmeldungen, WorkRecords, Proposal-Overrides und
externen Vergleichszeilen; Importzeilen bleiben als Importhistorie erhalten und verlieren nur ihren
Event-Link. Geteilte Vorschlagsfenster und Vergleichszeilen sowie Perioden, Personen, Familien,
Organisationen und bestehende Audit-Ereignisse bleiben erhalten. Vor der Löschung wird ein
mandantenbezogenes `EVENT_FORCE_DELETED`-Audit-Ereignis mit Anlassidentität, Akteur und
Abhängigkeitszahlen in derselben Transaktion geschrieben. Die Regeln zur Periodenaufbewahrung
werden dadurch nicht gelockert.

## D-046 – Verpflichtendes Helferkonto für die Einsatz-Anmeldung

**Entscheid:** Die öffentliche Einsatz-Anmeldung erfordert ab sofort ein Helferkonto (Registrierung mit Passwort, danach Login). Die frühere anonyme Anmeldung nur mit Kontaktdaten (Vorname, Nachname, Telefon, E-Mail) entfällt für neue Anmeldungen. Login und Registrierung öffnen sich auf der öffentlichen Einsatzplan-Seite als responsives In-Page-Modal statt als separate Seite; nach erfolgreichem Login kehrt die/der Helfer:in direkt zur zuvor gewählten Schicht zurück und kann sich dort verbindlich eintragen, statt auf eine andere Seite (z. B. Admin-Login) umgeleitet zu werden. Dieser Entscheid ersetzt D-007 und den zugehörigen Grundsatz "No forced registration for public volunteer signup" in `CLAUDE.md`.

**Abgrenzung:** Bereits vor diesem Entscheid erstellte anonyme Anmeldungen bleiben gültig; es findet keine rückwirkende Migration bestehender Datensätze statt. Admin- und Koordinationsflows sind von diesem Entscheid nicht betroffen.

**Entschieden von:** Product Owner, 2026-08-03.

## D-047 – Löschen einer bestätigten Kiosk-/Grill-Bestätigung

**Entscheid:** ADMIN und KOORDINATION können eine bereits bestätigte Kiosk- oder Grill-Bestätigung
eines Vorschlagsfensters vollständig rückgängig machen. Dabei werden alle nicht bereits stornierten
`Shift`-Zeilen dieser Art (Kiosk oder Grill) für das Fenster unbedingt storniert – anders als beim
Abgleichen (`_materialize_shifts`), das nur abweichende oder doppelte Schichten storniert und bei
bestehenden Anmeldungen blockiert. Bestehende Anmeldungen auf den stornierten Schichten werden
bewusst mit storniert, da der Admin explizit die gesamte Bestätigung inklusive ihrer Schichten
löschen möchte. Die zugehörige `kiosk_confirmed`/`grill_confirmed`-Markierung und die Splits dieser
Art auf dem `ProposalOverride` werden zurückgesetzt; das Fenster erscheint danach wieder als
unbestätigter Vorschlag. Die Bestätigung im Frontend erfolgt über einen einfachen nativen
`window.confirm()`-Dialog (wie beim bestehenden "Schichten abgleichen"), nicht über die strengere
getippte Bestätigungszeichenkette aus D-045, da hier keine Datensätze endgültig (hart) gelöscht,
sondern nur storniert werden.

**Abgrenzung:** Wegen der D-041/D-042-Reihenfolgeregel (Grill darf nur auf einem bereits bestätigten
Kiosk aufbauen) blockiert das Löschen der Kiosk-Bestätigung, solange die Grill-Bestätigung desselben
Fensters noch besteht; die Grill-Bestätigung muss zuerst gelöscht werden. Das Löschen der
Grill-Bestätigung allein ist jederzeit möglich und lässt die Kiosk-Bestätigung sowie deren Splits
unberührt. Ein `PROPOSAL_CONFIRMATION_DELETED`-Audit-Ereignis mit Fenster-Schlüssel, Art sowie
Anzahl stornierter Schichten und betroffener Anmeldungen (ohne PII) wird geschrieben.

**Entschieden von:** Product Owner, 2026-08-12 (im Rahmen von Live-Tests der Kiosk-/Grill-Bestätigung angefordert).

## D-048 – Organisationsspezifisches Erscheinungsbild (Theme)

**Entscheid:** Jede Organisation erhält ein `Theme`-Datensatz mit `logo_url`, `banner_url`,
`primary_color` und `secondary_color`, verwaltbar über `GET`/`PATCH
/api/admin/{organization_slug}/settings/theme` (nur ADMIN). Diese Werte werden zur Laufzeit als
CSS-Custom-Properties (`--primary`, `--secondary`) in die öffentlichen Helfer-Seiten (Einsatzplan,
Login/Registrierung/Profil) injiziert – dasselbe Muster, das im Admin-Bereich bereits existiert.
Logo und Banner werden per URL referenziert statt hochgeladen; ein Datei-Upload ist nicht Teil
dieser Version. Es gibt weiterhin keinen organisationsspezifischen Code – Name, Logo, Banner und
Farben kommen ausschliesslich aus der Datenbank pro Organisation.

**Abgrenzung:** Kein Datei-Upload für Logo/Banner in dieser Version (nur URL-Eingabe). Kein
automatisches Kontrastprüfen der gewählten Farben gegen Barrierefreiheitsvorgaben – das bleibt
Aufgabe der eingebenden Person.

**Entschieden von:** Product Owner, 2026-08-15 (angefordert im Rahmen des FC Thusis-Cazis
Branding-Rollouts).

## D-050 – Selbstverwaltung im Helferprofil: Einsatzvergütung pro Einsatz, Selbstabmeldung, Kinder

**Entscheid:** Drei neue, authentifizierte Selbstverwaltungsfunktionen im Helferprofil:

1. **Einsatzvergütung pro Einsatz statt nur global.** `Signup` erhält zwei neue, nullbare Spalten
   (`compensation_type`, `credited_family_member_id`), unabhängig von der bereits bestehenden
   `Volunteer.compensation_preference`. Diese Felder sind bewusst getrennt von
   `WorkRecord.compensation_type` (D-041), das erst nach Anwesenheit durch ADMIN gesetzt wird und
   den verbindlichen Auszahlungsdatensatz darstellt. Der Helfer kann seine Präferenz pro Einsatz
   jederzeit ändern (vor und nach dem Termin), das ADMIN-`WorkRecord` bleibt die massgebliche
   Klassifizierung. Dies setzt den bestehenden Grundsatz "Compensation type is chosen per work
   record, not globally per person" (`CLAUDE.md`) erstmals in der Helfer-Selbstverwaltung um.
2. **Selbstabmeldung mit Begründung im authentifizierten Profil.** Neuer Endpunkt
   `POST /api/volunteer/signups/{id}/cancel`, ergänzend zum bereits bestehenden
   token-basierten (unauthentifizierten) Abmeldelink. Verwendet dieselbe 8-Tage-Abmeldefrist
   (`cancellation_deadline`) wie der bestehende Link-Flow. Der optionale Freitextgrund wird im
   bereits vorhandenen `Signup.cancellation_reason`-Feld gespeichert (keine neue Spalte nötig);
   ein `AuditEvent` wird geschrieben, da die Aktion – anders als der anonyme Link-Flow –
   eindeutig einem eingeloggten Konto zurechenbar ist.
3. **Kinder direkt im Profil verwalten.** Neue Endpunkte
   `POST`/`PATCH`/`DELETE /api/volunteer/children` erlauben dem Helfer, `FamilyMember`-Datensätze
   vom Typ `CHILD` innerhalb der eigenen Familie selbst anzulegen, umzubenennen und zu entfernen –
   bisher gab es dafür keine Selbstverwaltung, nur die ADMIN-Familienverwaltung. Löschen ist ein
   echtes Hard-Delete (kein Soft-Delete-Flag existiert für `FamilyMember`); alle referenzierenden
   Fremdschlüssel (`Volunteer.compensation_family_member_id`, `Signup.credited_family_member_id`,
   `WorkRecord.credited_family_member_id`) sind `ON DELETE SET NULL`, sodass das Löschen eines
   Kindes historische Zuordnungen sicher auf "keine Zuordnung" zurücksetzt statt zu blockieren.

**Abgrenzung:** Kein Soft-Delete/Reaktivierung für gelöschte Kinder. Die Selbstabmeldefrist ist
identisch mit der bestehenden Regel des Link-Flows, nicht separat konfigurierbar. Die
Helfer-eigene `Signup.compensation_type`-Präferenz hat keine Auswirkung auf bereits von ADMIN
freigegebene oder ausbezahlte `WorkRecord`-Klassifizierungen (D-041 bleibt unverändert
massgeblich für die Auszahlung).

**Entschieden von:** Product Owner, 2026-08-16 (im Rahmen der Überarbeitung der Helferprofil-Seite
angefordert).

## D-051 – Organisationsspezifisches Branding transaktionaler E-Mails

**Entscheid:** Alle vier transaktionalen E-Mails (Passwort-Reset, Helfer-Registrierung,
Staff-Einladung, Anmeldebestätigung) werden neu als HTML mit reinem Text-Fallback versendet
(`EmailMessage.body_html`, zusätzlich zum weiterhin gepflegten `body_text`); `SmtpEmailSender`
baut daraus eine korrekte `multipart/alternative`-Nachricht über `email.message.EmailMessage`
(`set_content` + `add_alternative`), sodass reine Text-Clients weiterhin lesbar bleiben. Ein
gemeinsamer Layout-Baustein (`app/services/email/branding.py`, `render_branded_email`) umschliesst
den inhaltlichen Teil jeder E-Mail mit demselben tabellenbasierten, client-kompatiblen HTML-Rahmen
(Logo, Farbakzente aus `Theme.primary_color`/`secondary_color`, optionaler CTA-Button) und einer
Fusszeile, die App und Verein ausdrücklich trennt ("... im Auftrag von {Organisation} versendet").
Die Absenderadresse bleibt gemäss D-040 plattformweit unverändert; nur der Anzeigename im
From-Header wird pro Organisation berechnet als `"{short_name oder name} Grill Helfer"`
(z. B. "FCTC Grill Helfer" für FC Thusis-Cazis) und über `email.headerregistry.Address`
RFC 2047/5322-sicher kodiert – niemals als hartkodierter Vereinsname im Code. Logo-/Banner-URLs aus
`Theme`, die relative Pfade des Next.js-`public/`-Ordners sind, werden für E-Mail-Clients auf
Basis von `Settings.frontend_public_url` zu absoluten URLs aufgelöst. Für den Passwort-Reset, bei
dem `PasswordResetToken` bewusst keinen Organisationsbezug speichert (siehe D-040), wird die
Organisation rein lesend über die bestehende `Volunteer.user_id`-Verknüpfung ermittelt; ist keine
Organisation auflösbar (z. B. reine Staff-Konten), wird generisches Plattform-Branding ("GrillCrew")
verwendet statt zu raten.

**Abgrenzung:** Kein Datei-Anhang, keine Tracking-Pixel, keine zusätzliche Branding-Konfiguration
über die bereits in D-048 eingeführten `Theme`-Felder hinaus. Bestehende Betreffzeilen und der
fachliche Wortlaut jeder E-Mail bleiben unverändert; es handelt sich um Gestaltung und Absender,
nicht um neue Inhalte.

**Entschieden von:** Product Owner, 2026-08-16 (Rückmeldung: E-Mails sollen klar zwischen Verein
und der GrillCrew-App unterscheiden, statt den Namen eines privaten Absenderkontos zu zeigen).

## D-052 – Zeitbasierte Kiosk-/Grill-Deckung statt Event-Zuordnung, neue Spieltage-Übersicht

**Entscheid:** Die Kiosk-/Grill-Statusanzeigen pro Anlass im Spielplan (`serviceBadge` in
`planning-panel.tsx`) sowie die neue Spieltage-Übersicht ermitteln die relevanten Schichten eines
Spiels nicht mehr allein über `Shift.event_id` (das bei materialisierten Fenster-Schichten immer
nur das erste abgedeckte Spiel referenziert, siehe `ProposalService.confirm`), sondern zusätzlich
über eine Zeitüberschneidung von mindestens einer Minute zwischen Schichtzeitraum und
Spielzeitraum (Anpfiff + `Event.duration_minutes` bzw. organisationsweitem
`Settings.default_game_duration_minutes`). Ein neuer gemeinsamer Helfer
`frontend/lib/shift-coverage.ts` kapselt Belegungsberechnung, Zeitüberschneidung und lokale
Zeit-/Datumsumrechnung.

Die Statusanzeigen im Grillplan wurden neu definiert: "Kiosk offen"/"Grill offen" zeigen grün bei
voller Besetzung, orange (nur Grill) bei Teilbesetzung, rot bei fehlender Besetzung; eine separate
"Kioskdeckung fehlt"/"Grilldeckung fehlt"-Kachel erscheint nur bei Unterbesetzung. Die bisherige, aus
dem externen Plan-Abgleich abgeleitete "Kioskdeckung verifiziert/übersteuert/fehlt"-Kachel auf dieser
Karte entfällt zugunsten dieser Belegungsanzeige; der externe Plan-Abgleich selbst bleibt unverändert
auf der Kiosk-Seite (`ExternalPlanComparisonWorkspace`) bestehen.

Neu: eine eigenständige "Spieltage"-Übersicht unter Planung (`/planning/matchdays`), die pro
Spieltag Kiosk-/Grill-Deckung, zugewiesene Helfer (Name, Telefon) sowie die Spiele des Tages
(Kategorie, Team-gegen-Team-Beschreibung aus `Event.public_description`) in einer aufklappbaren
Liste zeigt.

**Abgrenzung:** Keine Backend-Änderungen; alle Daten stammen aus bereits vorhandenen Endpunkten
(`events-with-shifts`, `organization-settings`). Keine neue Berechtigungsrolle.

**Entschieden von:** Product Owner, 2026-08-16 (Rückmeldung zu falschen Kiosk-/Grill-Status-Tags im
Spielplan bei überlappenden Schichten und Wunsch nach einer tagesbasierten Spieltag-Übersicht).

## D-053 – Öffentliche Kiosk-Selbstanmeldung, Vereins-Hub-/Bewerbungsseite, plattformweite Landingpage

**Entscheid:** Der bisherige `/{org}`-Pfad war die öffentliche Grill-Einsatzplan-Seite
(`organization-landing.tsx`). Er wird zur Info-/Werbe-Landingpage für potenzielle Helfer; die
Einsatzplan-Seiten leben neu unter `/{org}/grill` (unverändertes Verhalten) und `/{org}/kiosk`
(neu, identische Selbstanmeldung wie Grill). `organization-landing.tsx` bekommt dafür eine
`shiftType: "GRILL" | "KIOSK"`-Prop; `GET /api/public/{org}/plan` bekommt einen optionalen
`shift_type`-Query-Parameter (Default `GRILL`, rückwärtskompatibel). Die
Signup-Erstellung selbst war bereits schicht-typ-unabhängig; einzig `PlanningService.
list_public_events` hatte einen weiteren, unabhängigen Hardcode auf GRILL in einer
Tag-Existenz-Subquery, der ebenfalls parametrisiert wurde – ohne diesen Fix hätte
`?shift_type=KIOSK` reine Kiosk-Spieltage stillschweigend unterschlagen.

Interne Rückkehr-Links (Registrierung, Logout, Profil-"Anmelden") unterscheiden neu zwischen
Hub (`/{org}`, generisch) und Einsatzplan-Seite (`/{org}/grill|kiosk`, Kontext-gebunden) über
einen neuen `?area=grill|kiosk`-Parameter im Registrierungslink (Default `grill` für alte Links).
Die Bestätigungs-E-Mail (`signup_confirmation.py`) verlinkt neu je nach Schicht-Typ auf
`/grill` oder `/kiosk`; der separate Verwaltungslink (`manage-signup/{token}`) bleibt bewusst
unter `/{org}/manage-signup/...` und NICHT unter `/grill`/`/kiosk` verschachtelt, da diese
Route nicht verschoben wurde. Die Willkommens-E-Mail nach Registrierung verlinkt unverändert auf
`/{org}` – das zeigt nach dem Umbau automatisch korrekt auf den neuen Hub. Bestehende, pro
Organisation gebrandete E-Mail-Inhalte (Betreff, Text, Branding) bleiben unverändert; nur
Linkpfade wurden angepasst.

Neu: `POST /api/public/{organization_slug}/volunteer-interest` (Schema
`VolunteerInterestCreate`) für Interessenten, die noch keine Helfer sind – Name, Kontakt,
optionale Nachricht/Interessensgebiet, honeypot- und min-fill-time-geschützt wie die
Schicht-Anmeldung. Keine Persistenz in v1: die Anfrage geht per E-Mail an alle aktiven
ADMIN/KOORDINATION-Staffmitglieder der Organisation. Diese Bewerbungs-Sektion lebt auf der
neuen `/{org}`-Hub-Seite zusammen mit Links zu Grill/Kiosk und einem Direktkontakt-Block
(wiederverwendet das bestehende `coordination_contact_label`/`coordination_contact_phone`
WhatsApp/Anruf-Muster aus `ContactModal`).

Zusätzlich neu: eine vereinsneutrale, plattformweite Marketing-Landingpage unter dem echten
Top-Level-Pfad `/` (`frontend/app/page.tsx`), unabhängig vom finalen Domain-/Markennamen (noch
nicht entschieden) – Basis für den späteren SaaS-Auftritt, mit Kontakt-CTA statt Self-Signup, da
neue Organisationen weiterhin manuell/durch einen Admin angelegt werden.

**Abgrenzung:** Keine Persistenz für Bewerbungen in v1 (siehe `docs/BACKLOG.md`). Kein
Self-Service zum Anlegen neuer Organisationen. Domain-Umzug selbst (Custom Domain, `FRONTEND_
PUBLIC_URL`/`CORS_ALLOWED_ORIGINS`) ist reine Infra und wartet auf eine externe Domain-/
Marken-Entscheidung.

**Entschieden von:** Product Owner, 2026-08-17 (Wunsch nach eigener Domain mit `/{org}/grill`
und `/{org}/kiosk`, einer Helfer-Info-Landingpage zur Gewinnung neuer Helfer, und einer
Bewerbungsmöglichkeit für Nicht-Helfer als Alternative zur direkten Selbstanmeldung).

## D-054 – Domain und Plattform-Markenname: vereinshelden.ch / "Vereinshelden"

**Entscheid:** Die Domain `vereinshelden.ch` (GoDaddy) und der Plattform-Markenname
"Vereinshelden" sind entschieden. Der bisherige generische Plattform-Name "GrillCrew" wird in
allen nutzerseitig sichtbaren Stellen ersetzt: E-Mail-Fallback-Branding
(`GENERIC_ORGANIZATION_NAME` in `backend/app/services/email/branding.py`, dort auch der
Footer-Disclaimer-Text und der Sender-Anzeigename-Fallback), der Betreff der
Anmeldebestätigungs-Mail (`backend/app/services/signup_confirmation.py`), und die
plattformweite Marketing-Landingpage (`frontend/app/page.tsx`, inkl. der jetzt echten
Platzhalter-Kontaktadresse `hallo@vereinshelden.ch` statt `hallo@DEINE-DOMAIN`). Interner
Repository-/Verzeichnisname (`grillcrew`) sowie rein interne, nicht nutzersichtbare Strings
(z. B. der OneDrive-Sync-HTTP-User-Agent) bleiben unverändert – das wäre eine grössere,
risikoreichere Umbenennung ohne Nutzennutzen und ist nicht Teil dieser Entscheidung.

Der eigentliche Domain-Umzug (Vercel Custom Domain + DNS bei GoDaddy, `FRONTEND_PUBLIC_URL`
und `CORS_ALLOWED_ORIGINS` auf Render) ist reine Infrastruktur ausserhalb des Repositories und
wird manuell durch den Product Owner durchgeführt (siehe Checkliste in der Session).

**Abgrenzung:** Keine Umbenennung des Git-Repositories/Verzeichnisnamens. Keine Änderung an
club-spezifischem Branding (das kommt weiterhin ausschliesslich aus der Datenbank, D-048).

**Entschieden von:** Product Owner, 2026-08-17.

## D-055 – Vereins-URL-Kürzel in den Einstellungen verwaltbar, Vereinsverzeichnis statt Fehlseite

**Entscheid:** `Organization.slug` (bislang nur per Datenbank-Migration/Bootstrap-Skript
gesetzt) ist jetzt über einen neuen, ADMIN-only-Endpunkt
`PATCH /api/admin/{organization_slug}/settings/organization` änderbar und in den
Admin-Einstellungen als neue, erste Sektion "Organisation" mit Live-Vorschau der resultierenden
URL sichtbar. Normalisierung (Kleinbuchstaben, zusammenhängende Sonderzeichen zu einem
Bindestrich) und globale Eindeutigkeitsprüfung (slug ist plattformweit eindeutig, nicht nur pro
Organisation) verhindern Kollisionen; ein `window.confirm`-Warnhinweis vor dem Speichern macht
explizit, dass bereits verschickte Links dadurch ungültig werden. Da die Autorisierung dieses
Routers die URL gegen die live aus der Datenbank aufgelöste Session-Organisation prüft (keine im
Token/Cookie gespeicherte Kopie des Slugs, siehe Recherche zu D-053), leitet das Frontend nach
erfolgreicher Umbenennung sofort auf `/{neuer-slug}/admin/settings` weiter, um eine sofort
403-werfende, veraltete URL zu vermeiden.

Zusätzlich behoben: `fetchPublicOrganization()` behandelte bislang jeden Fehlerfall identisch
(inklusive eines echten 404 für einen nicht existierenden Vereins-Slug) und rendert dafür
stillschweigend die generische `platformFallbackOrganization` – das erzeugte die gemeldete
"komische Seite" bei einem Tippfehler in der URL. Die drei öffentlichen Vereinsseiten
(`/{org}`, `/{org}/grill`, `/{org}/kiosk`) nutzen jetzt eine neue, strikte Variante
(`fetchPublicOrganizationStrict`), die einen echten 404 von einem transienten Backend-Ausfall
unterscheidet: nur bei einem bestätigten "Verein existiert nicht" leiten sie auf eine neue
`/vereine`-Seite weiter, die alle Organisationen der Plattform mit Logo auflistet
(`GET /api/public/organizations`, unauthentifiziert). Alle anderen Aufrufer von
`fetchPublicOrganization` (Admin-Bereich, Registrierung, Profil, Passwort-Reset,
Anmeldungsverwaltung) sind unverändert und behalten ihr bisheriges, nachsichtiges
Fallback-Verhalten bei einem echten Ausfall.

**Abgrenzung:** Keine Bearbeitung von Vereinsname/Kurzname/Kontaktdaten über diesen Endpunkt (nur
der Slug) – das bleibt eine spätere, separate Erweiterung bei Bedarf. Keine
Redirect-Infrastruktur für bereits verschickte Links mit dem alten Slug (akzeptiertes,
transientes Risiko bei noch wenigen echten Nutzern; `manage-signup`-Links sind davon ohnehin
nicht betroffen, siehe D-053).

**Entschieden von:** Product Owner, 2026-08-17 (Wunsch, den Vereins-Slug von
"fc-thusis-cazis" auf "fctc" zu ändern, verwaltbar in den Einstellungen statt einmaligem Fix;
Meldung einer "komischen Seite" bei falscher/unbekannter Vereins-URL).

## D-056 – Mobile Tages-Zeile ohne Zeilenumbruch, eigene Eintragung ohne E-Mail-Link erreichbar

**Entscheid:** Zwei unabhängige Mobile-Feinheiten aus einem gemeldeten Screenshot-Vergleich
(Samsung Internet vs. Chrome auf Android) sind behoben:

Erstens rendert `html` jetzt mit `text-size-adjust: 100%` (`frontend/app/globals.css`) – Chrome
auf Android vergrössert Text in schmalen Blöcken automatisch ("Font Boosting"), was bei
identischem CSS zu einem sichtbar grösseren Schriftbild als in Samsung Internet führte und damit
Zeilenumbrüche auslöste, die in Samsung Internet nicht auftraten. Zusätzlich bricht die
Tages-Zeile in `organization-landing.tsx` (Wochentag + Status-Badge) jetzt nie mehr um: der
Wochentag trunkiert statt umzubrechen, und unterhalb von 640px CSS-Breite (`useMediaQuery`,
`matchMedia`-basiert, standardmässig `false` bei SSR/Tests ohne Polyfill) wird der Wochentag
abgekürzt (`Sa., 22.08.2026` statt `Samstag, 22. August 2026`) und das Status-Badge zeigt nur
noch die Anzahl freier Plätze statt zusätzlich der Schichtanzahl (`"2 Plätze offen"` statt
`"1 Schicht offen · 2 Plätze"`).

Zweitens ist die "Meine Eintragung"-Detailseite (bisher nur über den persönlichen, einmaligen
E-Mail-Link mit `management_token` erreichbar, da der Token nur gehasht persistiert wird und
serverseitig nicht rekonstruierbar ist) jetzt zusätzlich für eingeloggte Helfer direkt in der App
erreichbar: ein neuer, authentifizierter Endpunkt `GET /api/volunteer/signups/{signup_id}`
liefert dieselbe Projektion (`ManagedSignupResponse`, wiederverwendet über die bereits
bestehende, jetzt modulübergreifend importierte `_managed_signup_response()`-Hilfsfunktion aus
`app/api/public.py`) für eine eigene Anmeldung, per Besitzprüfung über die aktuelle Session statt
per Token. Die reine Anzeige-Darstellung wurde aus `managed-signup-page.tsx` in eine gemeinsame
Komponente `frontend/components/signup-detail-card.tsx` extrahiert; die Absage-Sektion bleibt je
Aufrufer unterschiedlich (E-Mail-Link: eigener Bestätigungsdialog; App: die bestehende
`SignupCancelControl`, inkl. Frist-Fallback auf Direktkontakt). Die neue Seite
`/profile/signups/{id}` ist von zwei Stellen aus verlinkt: der "Kommende Einsätze"-Liste auf der
Profilseite und dem "Meine kommenden Einsätze"-Widget oben auf der Grill-/Kiosk-Seite (dessen
Klick bisher nur zur betroffenen Schicht in der Liste weiter unten scrollte – das entfällt
zugunsten der Detailseite, da die Absage bereits inline in diesem Widget möglich ist).

**Abgrenzung:** Keine Änderung an den bestehenden, token-basierten E-Mail-Links selbst – diese
bleiben unverändert nutzbar (z. B. für Helfer, die sich nicht einloggen). Keine
Redirect-Weiterleitung vom alten Klickverhalten des "Meine kommenden Einsätze"-Widgets.

**Entschieden von:** Product Owner, 2026-08-17 (Screenshot-Vergleich Samsung Internet vs. Chrome
mit Bitte um konsistente, nie umbrechende Darstellung; Wunsch, die "Meine Eintragung"-Seite auch
ohne den E-Mail-Link über Profil bzw. Klick auf einen kommenden Einsatz erreichen zu können).

## D-057 – Bugfix: eigene abgesagte Anmeldung blockierte fälschlich das Löschen eines Helfers

**Entscheid:** `FamilyService.delete_volunteer()` (`backend/app/services/family.py`) prüfte vor
dem Löschen bislang nur, ob eine Anmeldung auf einer nicht stornierten Schicht existiert
(`Shift.status != CANCELLED`), aber nicht, ob diese Anmeldung selbst noch aktiv ist. Eine vom
Helfer oder Admin bereits abgesagte Anmeldung (`Signup.status != ACTIVE`) auf einer weiterhin
offenen Schicht blockierte dadurch fälschlich das Löschen, obwohl die Schicht (korrekt) als
"Noch niemand eingetragen" angezeigt wurde – der gemeldete Fall von "hans Mustermann", dessen
Anmeldung zu "FCTC Senioren 30+" bereits storniert war. Die Prüfung filtert jetzt zusätzlich auf
`Signup.status == ACTIVE`; nur eine wirklich noch bestehende Verpflichtung blockiert das Löschen.

**Abgrenzung:** Keine Änderung am Löschverhalten für Helfer mit einer echten aktiven Anmeldung
oder erfassten Arbeitszeiten – beides blockiert weiterhin wie bisher.

**Entschieden von:** Product Owner, 2026-08-17 (Bug-Meldung: Helfer ohne sichtbare Zuweisung
liess sich nicht löschen).

## D-058 – Hilfe-Seite für Helfer (Grill/Kiosk), Kontaktformular mit vorbereitetem WhatsApp-Versand

**Entscheid:** Neue, generische Hilfe-/FAQ-Seite unter `/{org}/grill/hilfe` und `/{org}/kiosk/hilfe`
(gemeinsame Komponente `frontend/app/[org]/help-page.tsx`, gleiches `shiftType`-Muster wie
`OrganizationLanding`), erreichbar über einen neuen "Hilfe"-Button im Header der Grill-/
Kiosk-Einsatzplan-Seite (organization-landing.tsx). Inhalt: Kurzanleitung zur Schicht-Anmeldung
(4 Schritte) und ein FAQ-Akkordeon (native `<details>`/`<summary>`, keine zusätzliche JS-Logik
nötig) — Ausgangstext war ein vom Product Owner mit ChatGPT vorbereiteter Entwurf, überarbeitet
und vereinsneutral gemacht: keine hartkodierten Vereinsnamen, Koordinator-Namen oder Domains;
Vereinsname/-Koordinationskontakt kommen aus `organization.name` bzw.
`organization.settings.coordination_contact_label/_phone` (bestehende Felder, D-verschieden),
Links sind relative Pfade statt einer festen Domain.

Zusätzlich: ein Kontaktformular-Abschnitt ("Direkt Kontakt", nur sichtbar wenn
`coordination_contact_phone` gesetzt ist) nach demselben Prinzip wie die bestehende
`ContactModal` bei abgelaufener Absagefrist (`signup-cancel-control.tsx`), aber mit frei
eingebbarem Text statt einer festen Nachricht: eine neue Client-Komponente
`frontend/components/help-contact-form.tsx` lässt den Helfer eine Nachricht in ein Textfeld
schreiben, die live in einen `wa.me`-Link (`whatsAppHref()`) eingebaut wird — ein Klick auf
"Über WhatsApp senden" öffnet WhatsApp mit der vorbereiteten Nachricht, bereit zum Absenden.
Ein separater "Anrufen"-Button bleibt zusätzlich bestehen.

**Abgrenzung:** Keine serverseitige Persistenz oder Zustellung der Kontaktformular-Nachricht —
der Versand erfolgt ausschliesslich über den vom Nutzer selbst ausgelösten WhatsApp-Link, wie
beim bestehenden `ContactModal`-Muster. Kein Kontaktformular, wenn keine Koordinations-Telefonnummer
hinterlegt ist (dann nur die FAQ-Antworten mit generischem "der Koordination"-Verweis).

**Entschieden von:** Product Owner, 2026-08-17 (mitgebrachter FAQ-Text-Entwurf zur Überarbeitung
und Integration; Wunsch nach einem Kontaktformular nach dem Vorbild der bestehenden
Absagefrist-Kontaktoption, mit frei eingebbarem Text statt fester Nachricht).

## D-059 – Registrierung: beliebig viele Kinder statt nur einem

**Entscheid:** Die öffentliche Registrierung (`POST /api/auth/volunteer/register`) akzeptiert
jetzt eine Liste `children` (max. 10, je `first_name`/`last_name`/optional `team_name`) statt der
bisherigen drei fest verdrahteten `child_first_name`/`child_last_name`/`child_team_name`-Felder;
jedes Element wird als eigenes `FamilyMember` (`memberType = CHILD`) angelegt, das erste in der
Liste wird wie bisher automatisch die Standard-Vergütungszuordnung des neuen Helferkontos (später
im Profil änderbar). Im Registrierungsformular (`register-form.tsx`) lässt sich der
"Mitglied/Kind"-Block per neuem "+ Weiteres Kind hinzufügen"-Button beliebig oft duplizieren
(Vorname/Nachname/Mannschaft je Block); ab dem zweiten Block werden die Blöcke nummeriert und
einzeln über "Kind entfernen" wieder entfernbar. Komplett leer gelassene Blöcke werden beim
Absenden stillschweigend übersprungen statt einen Validierungsfehler auszulösen.

**Abgrenzung:** Kein Rückwärtskompatibilitäts-Shim für die alten Einzelfeld-Namen – die
Registrierung ist ein reiner First-Party-Endpunkt ohne externe API-Konsumenten.

**Entschieden von:** Product Owner, 2026-08-17 (Wunsch, mehrere Kinder direkt bei der
Registrierung erfassen zu können statt nur eines).

## D-060 – Familienname im Admin-Bereich Familien bearbeitbar

**Entscheid:** `Family.display_name` ist bislang nur bei der Erstellung setzbar; ein neuer
ADMIN/KOORDINATION-Endpunkt `PATCH /api/admin/{organization_slug}/families/{family_id}`
(`FamilyUpdate`, nur `display_name`) erlaubt das nachträgliche Umbenennen. Im Familien-Tab
erscheint neben der Familien-Überschrift ein "Bearbeiten"-Button (aria-label "Familienname
bearbeiten", um Kollisionen mit dem gleichnamigen Bearbeiten-Button im Helfer-Bearbeitungsformular
zu vermeiden), der ein Inline-Formular mit Speichern/Abbrechen öffnet. Nach erfolgreichem
Speichern wird sowohl die Detailansicht als auch die Familienliste links (samt erneuter
alphabetischer Sortierung) sofort aktualisiert, ohne einen Reload der gesamten Liste. Ist der neue
Name identisch mit dem alten, wird kein Request ausgelöst (No-Op, kein unnötiger Audit-Eintrag).

**Abgrenzung:** Keine Bearbeitung von `internal_note` über diesen Endpunkt (nur der Name) – das
bleibt eine spätere, separate Erweiterung bei Bedarf.

**Entschieden von:** Product Owner, 2026-08-17 (Wunsch, den Familiennamen im Familien-Tab
nachträglich anpassen zu können).

## D-061 – Bugfix: Browser-Autofill füllte Telefon/E-Mail im Registrierungsformular mit dem Namen

**Entscheid:** In `register-form.tsx` teilten sich Vorname-, Nachname-, Telefon- und E-Mail-Feld
faktisch dasselbe `autoComplete="name"` (nur E-Mail war explizit ausgenommen) – ein
Screenshot-Report zeigte, dass ein Handy-Browser beim Ausfüllen aus gespeicherten Kontaktdaten
dadurch überall den Namen einsetzte, auch ins Telefon- und E-Mail-Feld. Jedes Feld bekommt jetzt
sein korrektes, spezifisches Token (`given-name`, `family-name`, `tel`, `email`), damit
Browser-Autofill jedes Feld mit dem passenden gespeicherten Wert befüllt statt überall denselben
Namen einzusetzen. Die Kind-Felder (Vorname/Nachname/Mannschaft des Kindes) bekommen zusätzlich
`autoComplete="off"`, da sie nicht die Daten der registrierenden Person sind und nie aus deren
gespeichertem Profil vorbefüllt werden sollen.

**Abgrenzung:** Keine Änderung an anderen Formularen – der einzige weitere Treffer für
`autoComplete="name"` (`invite/[token]/invitation-form.tsx`, "Anzeigename") ist ein einzelnes
Freitext-Namensfeld ohne Vor-/Nachname-Aufteilung und dort korrekt.

**Entschieden von:** Product Owner, 2026-08-17 (Bug-Meldung mit Screenshot: Telefon- und
E-Mail-Feld wurden beim Autofill mit dem Namen befüllt statt mit Telefonnummer/E-Mail).

## D-062 – Bugfix: Vor-/Nachname-Korrektur eines Helfers synchronisierte nicht überallhin

**Entscheid:** `Volunteer.first_name`/`last_name` existieren dreifach dupliziert im System:
auf dem `Volunteer`-Datensatz selbst, auf dem verknüpften `FamilyMember` (HELPER,
`volunteer_id`-Link – zeigt sich in der Familienmitglieder-Liste im Familien-Tab), und als
`Signup.public_name_snapshot` je Anmeldung (zeigt sich im öffentlichen Einsatzplan und im
E-Mail-Link). Sowohl die Admin-Bearbeitung (`FamilyService.update_volunteer`) als auch die
Selbstbearbeitung im Helferprofil (`PATCH /api/volunteer/profile`) aktualisierten bisher nur den
`Volunteer`-Datensatz – die beiden anderen Kopien blieben stehen, sichtbar z. B. als
"Dario Andric Dario Andric" in der Familienmitglieder-Liste und im Einsatzplan, nachdem der durch
D-061 behobene Autofill-Bug ursprünglich beide Namensfelder mit dem vollen Namen befüllt hatte.

Neue gemeinsame Hilfsfunktion `sync_volunteer_display_name()` (`backend/app/services/family.py`)
wird jetzt aus beiden Stellen aufgerufen und schreibt den korrigierten Namen in den verknüpften
`FamilyMember` sowie in `public_name_snapshot` aller **aktiven** Anmeldungen dieses Helfers.
Abgeschlossene/vergangene Anmeldungen behalten ihren ursprünglichen Snapshot (Prinzip: eine
Anmeldung dokumentiert, wer sich zum Zeitpunkt des Einsatzes eingetragen hat). Die Synchronisation
läuft jetzt **immer** beim Speichern (auch ohne inhaltliche Namensänderung) – so genügt ein
erneutes Öffnen und Speichern über "Bearbeiten", um bereits verwaiste Kopien selbst zu heilen,
ohne dass eine echte Namensänderung nötig ist. Der Audit-Log-Eintrag wird weiterhin nur bei einer
echten Feldänderung angelegt.

**Abgrenzung:** Vergangene/abgeschlossene Anmeldungen werden nicht rückwirkend korrigiert (siehe
oben). Die Vereinsname-separate `Family.display_name` ist von diesem Bug nicht betroffen und
bleibt unverändert (D-060 regelt deren Bearbeitung separat).

**Nacharbeit für den Product Owner:** Bereits betroffene Datensätze (z. B. "Dario Andric",
"Madeleine Niemeyer") sind mit diesem Code-Fix noch nicht automatisch korrigiert – dafür einmal je
betroffenem Helfer im Helfer-Tab "Bearbeiten" öffnen und "Speichern" klicken (auch ohne inhaltliche
Änderung synchronisiert das jetzt die Familienmitglieder-Zeile und alle künftigen Einsatzplan-
Anzeigen).

**Entschieden von:** Product Owner, 2026-08-17 (Bug-Meldung mit Screenshot: doppelter Name
"Dario Andric Dario Andric" in Familienmitglieder-Liste und Einsatzplan; Wunsch, dass eine
Namenskorrektur überallhin durchschlägt).

## D-063 – Bugfix: Familienmitglieder-Liste zeigte nach Namenskorrektur weiterhin den alten Namen

**Entscheid:** Nach D-062 synchronisiert das Backend die Namenskopien korrekt, trotzdem blieb die
Familienmitglieder-Zeile im Familien-Tab weiterhin auf dem alten (fehlerhaften) Namen stehen – ein
separater, rein frontendseitiger Bug: `onSaved` beim Bearbeiten eines verknüpften Helfers
(`VolunteerKartei` in `families-panel.tsx`) aktualisierte nur den lokalen `volunteers`-State, nicht
aber den separat geladenen `members`-State, aus dem die Zeilenüberschrift
(`{member.first_name} {member.last_name}`) gerendert wird. Der Callback ruft jetzt zusätzlich
`refresh()` auf (bereits vorhandene Funktion, lädt `loadFamilyMembers` neu), sodass eine
Namenskorrektur sofort sichtbar wird, ohne dass Tab wechseln oder neu laden nötig ist.

**Abgrenzung:** Keine Änderung an den beiden anderen `onSaved`-Verwendungsstellen (primäre
Helfer-Tab-Detailansicht) – dort liest die Anzeige direkt aus demselben `volunteers`-State, den der
Callback bereits aktualisiert, ohne eine separate Kopie zu betreffen.

**Entschieden von:** Product Owner, 2026-08-17 (Rückmeldung: die in D-062 beschriebene Korrektur
über "Bearbeiten" → "Speichern" zeigte in der Familienmitglieder-Liste weiterhin den alten,
doppelten Namen).

## D-064 – Familien zusammenführen

**Entscheid:** Neuer Endpunkt `POST /api/admin/{organization_slug}/families/{family_id}/merge`
(Payload `{source_family_id}`) verschiebt alle Familienmitglieder (Helfer wie Kinder) der
Quell-Familie zur Ziel-Familie und löscht anschliessend die jetzt leere Quell-Familie
(`FamilyService.merge()`, Audit-Eintrag `FAMILY_MERGED_BY_ADMIN` mit `merged_family_id` und
Anzahl verschobener Mitglieder). Adressiert den Fall, dass für dasselbe Kind zwei Elternteile
unabhängig voneinander ein Helferkonto registriert haben und dadurch zwei separate
Familien-Gruppen für denselben Haushalt entstanden sind. Doppelte Kinder-Einträge nach dem
Zusammenführen müssen weiterhin manuell über "Entfernen" bereinigt werden – dafür gibt es
bewusst keine automatische Duplikaterkennung (Namen sind nicht eindeutig, ein Admin muss das
beurteilen).

Im Familien-Tab gibt es dafür eine neue Sektion "Familien zusammenführen" (zwischen
Familienmitglieder-Liste und "Familie löschen"): ein Dropdown mit allen anderen aktiven Familien
der Organisation (samt Kinder-/Helfer-Anzahl zur Orientierung) und ein Button
"Zusammenführen", der vor dem irreversiblen Verschieben+Löschen eine `window.confirm`-Bestätigung
verlangt. Nach Erfolg wird sowohl die Mitgliederliste der aktuell angezeigten (Ziel-)Familie neu
geladen als auch die Quell-Familie aus der Familienliste links entfernt.

**Abgrenzung:** Keine Zusammenführung über Organisationsgrenzen hinweg (der Service prüft beide
Familien tenant-scoped über `_get_active_family`). Keine automatische Zusammenführung von
`internal_note` – die der Ziel-Familie bleibt unverändert, die der Quell-Familie geht beim Löschen
verloren (nicht angefragt, out of scope).

**Entschieden von:** Product Owner, 2026-08-17 (konkreter Vorfall: zwei Elternteile eines Kindes
hatten sich unabhängig registriert und zwei "Züger"-Familien erzeugt; Wunsch, Helfer und Kinder in
eine gemeinsame Familie zusammenzuführen und doppelte Kinder danach manuell zu bereinigen).

## D-065 – Manuelle Helferzuweisung im Grill-Tab, Bestätigungsmail auch bei Admin-Zuweisung

**Entscheid:** `Planung/Grill` (`GrillWindowCard` in `grill-planning-panel.tsx`) bekommt dieselbe
manuelle Zuweisungs-Dropdown-Komponente (`ShiftVolunteerAssignment`), die im Kiosk-Tab bereits
existiert, unter jeder bestätigten Grill-Schicht. Die Auswahlliste ist auf Helfer mit
`is_grill_helper` gefiltert (`grillVolunteers`, geladen über `loadFamilyVolunteers` beim Öffnen
des Tabs) – Kiosk-only-Helfer erscheinen dort nicht. Analog dazu wurde ein zweiter, unabhängig
vorgefundener Bug in der allgemeinen Planung-Agenda (`planning-panel.tsx`, `PlanningPanel`)
behoben: dort erschien die Zuweisungs-Dropdown bereits für beide Schichttypen (die Agenda zeigt
Grill- und Kiosk-Schichten desselben Anlasses gemeinsam), zeigte aber für beide dieselbe
ungefilterte Helferliste. Sie filtert jetzt pro Schicht nach `shift.shift_type`
(`grillVolunteers`/`kioskVolunteers`).

`PlanningService.assign_volunteer()` (`backend/app/services/planning.py`) erzeugte bisher einen
`Signup` ohne `management_token_hash`, wodurch weder ein funktionierender "Anmeldung verwalten"-
Link existierte noch die Bestätigungsmail verschickt wurde, die eine Selbstanmeldung sonst immer
auslöst. Die Methode generiert jetzt wie `PublicSignupService.create_for_volunteer` einen
Management-Token und gibt ein neues `AssignedVolunteerSignup`-Datenobjekt (`shift`, `signup`,
`management_token`) zurück statt der blossen `Shift`. Die Route
`POST /shifts/{shift_id}/assign` (`backend/app/api/planning.py`) verschickt darauf basierend
dieselbe Bestätigungsmail wie `authenticated_signup`, per `background_tasks.add_task(...)`. Das
gilt für beide Einsatzarten (Grill und Kiosk), da der Fix auf der gemeinsamen Service-/Routen-
Ebene liegt.

**Abgrenzung:** Kein Opt-out für die Bestätigungsmail bei Admin-Zuweisung – sie entspricht
inhaltlich exakt der Selbstanmeldungs-Mail (gleicher Text, gleicher Link), nur der Auslöser ist
ein anderer.

**Entschieden von:** Product Owner, 2026-08-17 ("ich möchte unter planung/grill wie bei kiosk,
helfer können zuweisen bei den schichten, natürlich da nur grilleure auswehlbar. wenn einem eine
schicht zugewiesen wurde, sende das bestätigungs email").

## D-066 – WhatsApp-Kommunikationszentrum (Deckungslücken, vorbereitete Nachrichten, kein Konto-Zugriff)

**Entscheid:** Neuer Menüpunkt "WhatsApp" im Admin-Bereich (`frontend/app/[org]/admin/whatsapp-panel.tsx`,
Route `/{org}/admin/whatsapp`, sichtbar für ADMIN/KOORDINATION) zeigt die Einsätze der nächsten 10 Tage
gruppiert nach Tag mit Deckungsstatus (wiederverwendet `occupancyStatus`/`localDateOf` aus
`lib/shift-coverage.ts` sowie die bereits geladenen Planungsdaten aus `loadAdminPlanningData`), hebt
offene Deckungslücken hervor und bietet darunter einen Nachrichten-Baukasten: eine Vorlage mit
Platzhalter `{Vorname}`, eine durchsuchbare Helferauswahl (gefiltert auf `is_grill_helper`/
`is_kiosk_helper`, wie beim bestehenden Zuweisungs-Dropdown), und pro ausgewähltem Helfer einen fertigen
`wa.me`-Link mit personalisiertem Text (wiederverwendet `whatsAppHref()` aus `lib/phone.ts`, exakt das
D-058-Muster) — ein Klick öffnet WhatsApp beim Admin selbst, gesendet wird manuell. Für eine
Gruppennachricht (WhatsApp erlaubt kein URL-Vorausfüllen einer bestehenden Gruppe) gibt es stattdessen
ein Textfeld mit "In Zwischenablage kopieren". Ein zusätzlicher Button "KI-Kontext kopieren" fasst die
offenen Lücken der nächsten 10 Tage als Text zusammen und kopiert ihn in die Zwischenablage, zum Einfügen
in ein externes KI-Werkzeug (Claude Code, ChatGPT) nach Wahl des Nutzers — der generierte Entwurf wird
manuell zurück in die App eingefügt. Kein neuer Backend-Endpunkt nötig: alle Daten (Schichten, Helfer,
Telefonnummern) existieren bereits.

**Abgrenzung (bewusst, siehe `CLAUDE.md`s "Forbidden: WhatsApp Business API in version 1" und
`docs/BACKLOG.md`s "vollständig automatisierte WhatsApp-Business-Nachrichten"):** Keine Verbindung zu
einem echten WhatsApp-Konto, kein Lesen oder Filtern eingehender Chats, kein automatischer Versand –
jede Nachricht wird vom Admin selbst im eigenen WhatsApp ausgelöst. Keine eingebaute KI-Textgenerierung
im Backend (kein LLM-API-Vertrag, keine laufenden Kosten pro Anfrage) – die KI-Unterstützung läuft
bewusst extern über das Abo-Werkzeug des Nutzers (Claude Code/ChatGPT), die App liefert nur den
kopierbaren Kontext. Der bisherige Backlog-Eintrag "Kommunikationswerkzeug: Nachrichten aus der App
generieren und per Klick an WhatsApp übergeben" ist damit umgesetzt und aus `docs/BACKLOG.md` entfernt;
"vollständig automatisierte WhatsApp-Business-Nachrichten" bleibt weiterhin explizit Backlog.

**Entschieden von:** Product Owner, 2026-08-17. Ursprünglicher Wunsch ging deutlich weiter (Live-Verbindung
zum echten WhatsApp-Konto, automatisches Chat-Filtern nach Helferprofil, eingebaute KI-Textgenerierung) –
nach Rückfrage (Konflikt mit dem "Forbidden"-Eintrag und den ToS-/Datenschutzrisiken einer inoffiziellen
WhatsApp-Web-Automatisierung erklärt) hat sich der Product Owner für die oben beschriebene, sichere
Variante entschieden und für die KI-Unterstützung ausdrücklich gegen eine kostenpflichtige Backend-API
und für die eigene Abo-Nutzung (Claude Code/ChatGPT) votiert.

## D-067 – Passwort-Bestätigungsfeld bei Registrierung, Passwort ändern im Profil

**Entscheid:** Das Registrierungsformular (`frontend/app/register/register-form.tsx`) bekommt ein
zweites Passwortfeld "Passwort bestätigen". Der Abgleich läuft live: sobald das Bestätigungsfeld nicht
leer ist, vergleicht eine abgeleitete Größe (`passwordsMismatch`/`passwordsMatch`) beide Eingaben bei
jedem Tastendruck und zeigt sofort "Die Passwörter stimmen nicht überein." (rot, Eingaberand ebenfalls
rot markiert) bzw. "Die Passwörter stimmen überein." (grün) — beide über `aria-live="polite"` auch für
Screenreader. `submit()` prüft vor dem eigentlichen `registerVolunteer()`-Aufruf zusätzlich als
Sicherheitsnetz noch einmal serverseitig-frei nach, falls die Eingabe z. B. per Passwort-Manager ohne
Tastenanschläge gesetzt wurde. Adressiert Tippfehler beim Registrieren, die sonst erst beim nächsten
Login-Versuch auffallen.

Zusätzlich kann ein eingeloggter Helfer sein Passwort jetzt selbst im Profil ändern: eine neue,
einklappbare Sektion "Passwort ändern" (`ChangePasswordSection` in `frontend/app/profile/page.tsx`)
mit aktuellem Passwort, neuem Passwort und Bestätigung (dieselbe clientseitige Abgleichsprüfung wie bei
der Registrierung). Backend: neuer Endpunkt `POST /api/auth/change-password` (authentifiziert, CSRF-
geschützt) und `PasswordResetService.change_password()` (`backend/app/services/auth.py`) — verifiziert
das aktuelle Passwort (`verify_password_or_dummy`, konstante Fehlerantwort-Zeit wie beim Login), prüft
die org-spezifische Mindestlänge, widerruft alle bestehenden Refresh-Tokens des Nutzers (andere Geräte/
Sessions) und stellt sofort eine frische Session für den anfragenden Browser aus (`issue_session` +
`set_auth_cookies`), damit die aktuelle Sitzung eingeloggt bleibt — exakt das bereits etablierte Muster
aus `reset_password`, nur mit Passwort-Verifikation statt Token. Neuer Audit-Event-Typ
`PASSWORD_CHANGED_BY_USER`.

**Abgrenzung:** Kein Passwort-Bestätigungsfeld beim Token-basierten "Passwort vergessen"-Formular
(`reset-password-form.tsx`) — nicht angefragt, bleibt unverändert mit einem einzelnen Feld.

**Entschieden von:** Product Owner, 2026-08-17 ("bei der registrierung als helfer, wäre sinnvoll das
password 2 mal eingeben zu müssen mit überprüfung ob identisch [...] nach einloggen in mein profil,
sollte der helfer die möglichkeit haben sein password zu ändern").
