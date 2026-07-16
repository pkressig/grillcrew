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
