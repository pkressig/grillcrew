# RFC – Offene Architekturentscheidungen vor Sprint 1

**Status dieses Dokuments:** beschlossen
**Zweck:** Jede hier beschriebene Frage blockiert einen Sprint der Roadmap. Für jede Frage werden Optionen mit Vor- und Nachteilen sowie eine Empfehlung des Technical Lead vorgestellt. Sobald eine Option gewählt ist, wird sie als neue Entscheidung (D-021 ff.) in `docs/DECISIONS.md` übernommen und der betroffene RFC-Abschnitt auf **beschlossen** gesetzt. Bis dahin gilt: nichts aus diesem Dokument ist umzusetzen.

**Konventionen:**
- Jeder RFC hat einen Status: `offen` | `beschlossen (D-xxx)` | `zurückgestellt`
- Die Reihenfolge entspricht der Entscheidungspriorität. RFC-001 bis RFC-006 blockieren das Datenbankschema bzw. Sprint 1, RFC-007 bis RFC-010 blockieren Sprint 3 bzw. den Import.
- Empfehlungen ändern keine bestehenden Beschlüsse eigenmächtig. Wo eine Empfehlung einen bestehenden Beschluss präzisiert oder berührt (z. B. D-005), ist das explizit markiert.

---

## RFC-001 – Modell des Anwesenheitsstatus

**Status:** beschlossen (D-021)
**Blockiert:** Sprint 1 (Schema), Sprint 6 (Einsatzabschluss)
**Bezug:** D-019, `docs/DATA_MODEL.md` (WorkRecord), BR-009

### Problem

D-019 verlangt fünf dokumentierbare Status: erschienen, entschuldigt abgesagt, kurzfristig abgesagt, nicht erschienen, Ersatz organisiert. Im Datenmodell liegt `attendanceStatus` auf dem `WorkRecord`. Ein WorkRecord ist aber definiert als «tatsächlich geleistete Arbeit» mit `actualStart` und `actualEnd`. Bei «nicht erschienen» oder «kurzfristig abgesagt» existiert keine Arbeit – es gäbe also einen WorkRecord ohne Zeiten, dessen Semantik der Definition widerspricht. «Ersatz organisiert» beschreibt zudem eher das Schicksal einer Anmeldung als eine Arbeitsleistung.

### Warum es wichtig ist

Diese Entscheidung prägt das Herz des Schemas. Wird sie falsch getroffen, entstehen dauerhaft WorkRecords mit Null-Zeiten, jede Auswertung (Stunden, Auszahlung, Sollstände) muss diese Sonderfälle herausfiltern, und die Zuverlässigkeitsstatistik pro Helfer (PRD 5.7) wird fehleranfällig. Eine spätere Migration betrifft die zentralste Tabelle des Systems.

### Optionen

**Option A – attendanceStatus bleibt auf WorkRecord, Zeiten werden nullable**

Jede abgeschlossene Anmeldung erzeugt einen WorkRecord, auch ohne Arbeit.

- Pro: Eine einzige «Abschlusstabelle»; Auswertungen haben genau eine Quelle; Papier-Nachträge und Import landen einheitlich an einem Ort.
- Contra: `actualStart`, `actualEnd`, `durationMinutes`, `finalCompensationType` werden nullable und die Invariante «WorkRecord = Arbeit» fällt; jede Summenabfrage braucht `WHERE attendanceStatus = ERSCHIENEN`; das Risiko stiller Fehlberechnungen steigt; die Constraint «Dauer darf nicht negativ sein» wird um «oder null, aber nur wenn …» verkompliziert.
- Langzeitfolge: Das Modell bleibt einfach in der Tabellenzahl, aber jede künftige Auswertung, jeder Export und jeder Report trägt die Sonderfalllogik mit sich. Erfahrungsgemäss ist genau das die Quelle schleichender Reporting-Bugs.

**Option B – Anwesenheitsstatus wandert vollständig auf das Signup**

Das Signup erhält ein Feld `outcome` mit den fünf Werten aus D-019. Ein WorkRecord entsteht nur, wenn tatsächlich gearbeitet wurde (`outcome = ERSCHIENEN`).

- Pro: Saubere Semantik: Signup = Absicht und deren Ausgang, WorkRecord = Realität; alle Zeitfelder bleiben Pflichtfelder; Auswertungen über Stunden und Geld brauchen keine Filter; Zuverlässigkeitsstatistiken laufen über Signups.
- Contra: Papier-Nachträge und Importe, für die nie ein Signup existierte, brauchen eine Lösung (siehe Option C); zwei Tabellen müssen konsistent gehalten werden (`outcome = ERSCHIENEN` ⇔ WorkRecord existiert), was eine zusätzliche Invariante mit Test bedeutet.
- Langzeitfolge: Klare Domänensprache, die auch spätere Module (Kiosk, Fahrdienst) unverändert nutzen können. Die Invariante ist einmalig zu implementieren und dann stabil.

**Option C – Option B plus rückwirkende Admin-Signups (Empfehlung)**

Wie B, zusätzlich gilt: Für Papier-Nachträge und Importe legt Admin (bzw. der Importer) rückwirkend ein Signup mit `source = ADMIN` bzw. `source = IMPORT` an. `WorkRecord.signupId` wird dadurch verpflichtend statt nullable.

- Pro: Alle Vorteile von B; zusätzlich existiert für jede Leistung eine durchgängige Kette Schicht → Signup → WorkRecord; das Änderungsprotokoll (BR-006, BR-009) hat einen einheitlichen Anker; keine zwei Codepfade für «mit/ohne Signup».
- Contra: Der Importer muss synthetische Signups erzeugen (geringer Mehraufwand); rückwirkende Signups dürfen keine Belegungsprüfung und keine E-Mails auslösen, was einen klar markierten Erstellungspfad erfordert.
- Langzeitfolge: Das strengste und langfristig wartungsärmste Modell. Die Einschränkung «keine Nebenwirkungen bei rückwirkenden Signups» ist einmalig sauber zu bauen.

### Empfehlung

**Option C.** Begründung: Sie erhält die zentrale Invariante «WorkRecord = tatsächlich geleistete, bezifferbare Arbeit», auf der BR-003 und BR-004 aufbauen, und macht D-019 dort ausdrückbar, wo er fachlich hingehört – am Ausgang einer Anmeldung. Der Mehraufwand für synthetische Signups ist klein und einmalig; die Alternative (Option A) verteilt Komplexität dauerhaft über alle Auswertungen.

Folgeänderung am Datenmodell (nur nach Beschluss): `Signup.outcome`, `WorkRecord.signupId` Pflichtfeld, `attendanceStatus` entfällt auf WorkRecord.

---

## RFC-002 – Reservierungs- und Bestätigungslogik der öffentlichen Eintragung

**Status:** beschlossen (D-022)
**Blockiert:** Sprint 3; Statusmodell in Sprint 1 (RFC-006)
**Bezug:** PRD 5.2, BR-005

### Problem

PRD 5.2 verlangt eine Bestätigung per E-Mail. Unklar ist, ob eine Anmeldung den Helferplatz sofort reserviert oder erst nach Klick auf den Bestätigungslink. Beides hat reale Risiken: Sofortreservierung kann Plätze durch Tippfehler-E-Mails blockieren; späte Reservierung kann dazu führen, dass zwei Personen glauben, denselben Platz zu haben, oder dass wenig technikaffine Helfer ihren Platz verlieren, weil sie den Link nicht anklicken.

### Warum es wichtig ist

Das ist die wichtigste UX-Entscheidung des Produkts. Die Zielgruppe umfasst ausdrücklich ältere, wenig technikaffine Personen (PRD 3, UX-Ziel «innerhalb weniger Sekunden»). Jede Reibung an dieser Stelle entscheidet darüber, ob die App VolunteerSignup wirklich ersetzt oder ob Helfer zur Koordination zurück auf WhatsApp ausweichen.

### Optionen

**Option A – Sofortige verbindliche Reservierung (Empfehlung)**

Die Anmeldung reserviert den Platz sofort. Die Bestätigungs-E-Mail dient der Information und enthält den Verwaltungslink. Anmeldungen mit unzustellbarer E-Mail erscheinen im Admin-Handlungsbedarf.

- Pro: Entspricht dem mentalen Modell der Zielgruppe («ich habe mich eingetragen, also bin ich eingetragen»); kein Platzverlust durch nicht geklickte Links; einfachstes Statusmodell; identisches Verhalten wie die heutige Papierliste.
- Contra: Tippfehler in der E-Mail bleiben zunächst unbemerkt (der Platz ist trotzdem korrekt reserviert, aber Verwaltungslink und Erinnerungen kommen nicht an); theoretisch kann jemand fremde Namen eintragen – dieses Risiko besteht heute bei Papierliste und VolunteerSignup genauso und wird über den Admin-Handlungsbedarf plus RFC-010 begrenzt.
- Langzeitfolge: Geringste Komplexität. Sollte Missbrauch real auftreten, kann später ein Verfallsmechanismus (Option C) ergänzt werden, ohne das Schema zu ändern.

**Option B – Double-Opt-in: Platz erst nach E-Mail-Klick**

Die Anmeldung erzeugt eine unverbindliche Vormerkung; der Platz gilt erst nach Bestätigung als belegt.

- Pro: Verifizierte E-Mail-Adressen ab Tag eins; sauberer Spam-Schutz; keine Blockade durch Fantasie-Adressen.
- Contra: Für die Zielgruppe die schlechteste Variante: Wer den Link nicht findet (Spam-Ordner, geteilte Familien-Mailadresse), verliert den Platz kommentarlos; während der Schwebezeit ist die Belegungsanzeige mehrdeutig («frei, aber vielleicht doch nicht»); widerspricht dem UX-Ziel, dass die Eintragung in Sekunden erledigt und ihr Erfolg sofort erkennbar ist.
- Langzeitfolge: Dauerhaft höherer Support-Aufwand für die Koordination («ich hatte mich doch eingetragen»). Genau die Art Reibung, die das Projekt beseitigen soll.

**Option C – Sofortige Reservierung mit automatischem Verfall ohne Bestätigung**

Wie A, aber unbestätigte Anmeldungen verfallen nach z. B. 48 Stunden automatisch.

- Pro: Kompromiss aus Platzschutz und Verifikation.
- Contra: Automatischer, unsichtbarer Platzverlust trifft überproportional die wenig technikaffinen Helfer; erzeugt kurzfristig frei werdende Plätze, die niemand bemerkt; braucht Hintergrundjobs und zusätzliche Status; erklärungsbedürftig.
- Langzeitfolge: Der Verfallsmechanismus muss dauerhaft kommuniziert, überwacht und supportet werden. Komplexität ohne nachgewiesenen Bedarf.

### Empfehlung

**Option A.** Begründung: Sie optimiert für das reale Risiko (Helfer verpassen Bestätigungen) statt für das theoretische (böswillige Masseneintragungen), das über RFC-010 und den Admin-Handlungsbedarf abgedeckt wird. Der Verein ist klein, die Koordination kennt ihre Leute – ein falscher Eintrag fällt sofort auf. Option C bleibt als dokumentierte Ausbaustufe im Backlog, falls Missbrauch tatsächlich auftritt.

---

## RFC-003 – Überschussstunden über das Familiensoll

**Status:** beschlossen (D-023)
**Blockiert:** Sprint 5/6; berührt Schema (Split ja/nein)
**Bezug:** BR-001, BR-002, D-012, Excel-Realität «unentgeltliche Stunden»

### Problem

Eine Familie hat noch 2 offene Sollstunden; der Helfer leistet 5 Stunden mit Vergütungsart «Sollstunden». BR-002 erlaubt genau eine Hauptart pro Einsatzleistung. Was geschieht mit den 3 Überschussstunden: Übererfüllung ohne Folgen, automatisch unentgeltlich, wahlweise Auszahlung, oder Aufteilung des Einsatzes?

### Warum es wichtig ist

Ohne diese Regel ist der Saisonabschluss (Erfolgskriterium: keine manuelle Neuberechnung) nicht implementierbar. Die Regel entscheidet ausserdem, ob das Schema einen WorkRecord-Split unterstützen muss – eine strukturelle Frage, die vor Sprint 1 geklärt sein sollte, auch wenn die Funktion erst in Sprint 6 gebaut wird.

### Optionen

**Option A – Übererfüllung ist erlaubt und wird einfach ausgewiesen (Empfehlung)**

Der ganze Einsatz bleibt «Sollstunden». Das Familienkonto kann mehr als 100 % erreichen; die Auswertung zeigt z. B. «14 von 12 Stunden». Kein Geldanspruch aus Überschuss.

- Pro: Einfachste Regel, in einem Satz erklärbar; entspricht dem Geist von Freiwilligenarbeit («wer mehr hilft, hat mehr geholfen»); kein Split, keine Schemaänderung; deckungsgleich mit der bisherigen Excel-Praxis, in der Übererfüllung schlicht sichtbar war; keine Anreizverzerrung, Einsätze künstlich auf die Sollgrenze zuzuschneiden.
- Contra: Wer für Überschuss Geld möchte, muss die Vergütungsart vor dem Einsatz bewusst auf «Auszahlung» setzen oder Admin um eine manuelle Korrektur bitten; Grenzfall «ich wusste nicht, dass wir schon erfüllt sind» braucht Kulanz durch die Koordination.
- Langzeitfolge: Dauerhaft wartungsarm. Sollte sich später echter Bedarf zeigen, kann ein Split (Option C) ergänzt werden, ohne bestehende Daten umzudeuten.

**Option B – Überschuss wird automatisch «unentgeltlich»**

Das System schneidet beim Abschluss automatisch an der Sollgrenze und typisiert den Rest um.

- Pro: Sollkonten enden exakt bei 100 %; die Kategorie «unentgeltlich» aus der Excel-Welt wird automatisch gefüllt.
- Contra: Verletzt BR-002 (eine Hauptart pro Leistung) oder erzwingt einen versteckten automatischen Split; die Umtypisierung passiert ohne Zutun des Helfers und ist schwer erklärbar; die Reihenfolge der Einsatzbestätigungen entscheidet plötzlich darüber, welcher Einsatz «gekappt» wird – ein klassischer Streitfall; Korrekturen an einem frühen Einsatz kaskadieren in spätere.
- Langzeitfolge: Reihenfolgeabhängige Berechnungslogik ist die teuerste Sorte Fachlogik: schwer zu testen, schwer zu auditieren, schwer rückgängig zu machen.

**Option C – Wahl beim Abschluss mit systemgestütztem Split**

Beim Einsatzabschluss zeigt die App den Überschuss an; Helfer oder Admin wählen dessen Behandlung (unentgeltlich oder Auszahlung); technisch entstehen zwei WorkRecords.

- Pro: Maximale Fairness und Transparenz; BR-002 bleibt pro WorkRecord gewahrt.
- Contra: Deutlich mehr UI- und Modelllogik in Version 1 (Split, Rück-Split bei Korrekturen, Anzeige zusammengehöriger Records); der Abschlussdialog wird komplexer – genau dort, wo die UX-Regeln maximale Einfachheit fordern; Bedarf ist nicht belegt.
- Langzeitfolge: Das Schema müsste Split-Beziehungen (`parentWorkRecordId` o. ä.) dauerhaft tragen, auch wenn 95 % der Einsätze sie nie nutzen.

### Empfehlung

**Option A**, ergänzt um eine dokumentierte Admin-Kompetenz: Admin darf einen Einsatz im Korrekturweg manuell in zwei WorkRecords aufteilen (bestehende Korrektur- und Protokollpflicht nach BR-009 genügt dafür). So bleibt die Regel einfach, ohne Härtefälle unlösbar zu machen. Für das Schema bedeutet das: kein Split-Mechanismus in Version 1, aber die Aufteilung «ein Signup → mehrere WorkRecords» wird nicht durch Constraints verboten.

Hinweis: Diese Empfehlung ist mit RFC-001 Option C verträglich (mehrere WorkRecords pro Signup nur im Admin-Korrekturweg).

---

## RFC-004 – Berechnung und Einfrieren der Sollstunden

**Status:** beschlossen (D-024)
**Blockiert:** Sprint 5; Schema (`FamilyRequirement`)
**Bezug:** BR-001, D-012, `FamilyRequirement` (source: DEFAULT | OVERRIDE)

### Problem

Das Soll (8 h bei einem Kind, 12 h ab zwei Kindern) hängt von der Kinderzahl ab, aber Kinder haben `activeFrom`/`activeUntil`. Unklar ist: Zu welchem Zeitpunkt wird die Kinderzahl bestimmt? Was passiert, wenn ein Kind mitten im Vereinsjahr dazukommt oder austritt? Wird das Soll gespeichert (materialisiert) oder bei jeder Anzeige neu berechnet?

### Warum es wichtig ist

Sollstunden sind der finanziell und sozial sensibelste Wert der App – Familien werden daran gemessen. Ein Soll, das sich rückwirkend still ändert, zerstört Vertrauen («letzte Woche stand da noch 8»). Gleichzeitig muss das Modell mit der Realität unterjähriger Ein- und Austritte umgehen.

### Optionen

**Option A – Laufende Neuberechnung bei jeder Anzeige**

Das Soll wird stets live aus den aktuell aktiven Kindern abgeleitet; `FamilyRequirement` existiert nur für Overrides.

- Pro: Immer «korrekt» im Sinne des aktuellen Datenstands; keine Materialisierungslogik.
- Contra: Rückwirkende Kinderpflege (z. B. verspätet erfasster Austritt) ändert still bereits kommunizierte Sollwerte und sogar abgeschlossene Vereinsjahre; Auswertungen sind nicht reproduzierbar; widerspricht dem Prinzip des revisionsfähigen Protokolls (PRD 6).
- Langzeitfolge: Historische Reports werden unzuverlässig; jeder Saisonabschluss müsste die Werte trotzdem irgendwo einfrieren – die Materialisierung kommt also doch, nur später und unter Druck.

**Option B – Harter Stichtag Vereinsjahresbeginn**

Beim Aktivieren des Vereinsjahres wird das Soll aus der Kinderzahl am Stichtag materialisiert und bleibt fix; Änderungen nur per Admin-Override.

- Pro: Maximal vorhersehbar; einfach zu erklären.
- Contra: Familien, die erst im Frühling dazustossen (real häufig: neue Kinder starten zur Rückrunde), haben am Stichtag null Kinder und damit kein Soll – jede Neuzugangs-Familie braucht manuelle Nacharbeit; der Stichtag zwingt Admin, alle Familien vor Jahresstart gepflegt zu haben.
- Langzeitfolge: Systematischer manueller Aufwand genau bei den Fällen, die am häufigsten vorkommen (Zu- und Abgänge).

**Option C – Materialisierung bei Erstbezug, danach eingefroren mit Admin-Hinweis (Empfehlung)**

Beim ersten Ereignis, das ein Soll benötigt (erste Sollstunden-Gutschrift der Familie im Vereinsjahr oder manuelles Anlegen durch Admin), wird `FamilyRequirement` mit `source = DEFAULT` aus der dann aktiven Kinderzahl erzeugt und eingefroren. Ändert sich die Kinderzahl später im Jahr, ändert das System nichts automatisch, erzeugt aber einen Eintrag im Admin-Handlungsbedarf («Kinderzahl der Familie X hat sich geändert – Soll prüfen»). Admin entscheidet per Override (`source = OVERRIDE`, mit Grund, protokolliert – wie in BR-001 bereits vorgesehen).

- Pro: Kommunizierte Werte ändern sich nie still; Neuzugänge mitten im Jahr erhalten automatisch ein korrektes Soll zum Zeitpunkt ihres Einstiegs; passt exakt zum bereits beschlossenen `FamilyRequirement`-Modell und zur Override-Regel aus BR-001; der Mensch bleibt bei Grenzfällen (anteiliges Soll für Spätzugänge?) in der Verantwortung, was bei einem Verein dieser Grösse angemessen ist.
- Contra: «Erstbezug» muss präzise definiert und getestet werden; zwischen Kinderänderung und Admin-Prüfung ist das angezeigte Soll formal veraltet (dafür existiert der Handlungsbedarf-Hinweis).
- Langzeitfolge: Reproduzierbare Historie, minimale Automatik, klarer Audit-Pfad. Sollte der Verein später anteilige Sollwerte für Spätzugänge wollen, ist das eine reine Override-Konvention, keine Schemaänderung.

### Empfehlung

**Option C.** Zusätzlich zu beschliessen (Teil desselben Entscheids): Für die Erfüllung zählt weiterhin die Summe beider Teil-Saisons gegen das eine Jahres-Soll (D-012 bleibt unverändert); ein Soll pro Teil-Saison wird ausdrücklich nicht eingeführt.

---

## RFC-005 – Staff-Rollenmodell für Version 1

**Status:** beschlossen (D-025)
**Blockiert:** Sprint 1 («Rollenbasis», Admin-Auth), Sprint 4 (Staff-Ansicht)
**Bezug:** D-018, PRD 5.12, BR-010, `StaffMembership` (role, scope optional)

### Problem

D-018 und PRD 5.12 verlangen rollenbasierten, auf das Notwendige begrenzten Zugriff, nennen aber keine konkreten Rollen. Sprint 1 soll die Rollenbasis bauen – ohne Rollenliste ist das nicht möglich.

### Warum es wichtig ist

Berechtigungen werden serverseitig durchgesetzt (CLAUDE.md) und sind sicherheitskritisch (Kontaktdaten!). Ein zu feines Modell in Version 1 erzeugt Verwaltungsaufwand, den niemand pflegt; ein zu grobes Modell erzwingt später eine riskante Migration der Zugriffslogik.

### Optionen

**Option A – Zwei Rollen: ADMIN und STAFF**

- Pro: Minimal, sofort baubar, kaum Fehlkonfigurationsrisiko.
- Contra: «Staff» ist laut D-018 heterogen (Kioskteam vs. Vorstand); alle Staff sähen dieselben Kontaktdaten – das verletzt das Prinzip «nur erforderliche Daten»; die im PRD angekündigte Vorstands-Leserolle wäre nicht abbildbar, ohne dem Vorstand volle Staff-Rechte zu geben.
- Langzeitfolge: Früher Umbau absehbar, sobald der Vorstand Zugriff will.

**Option B – Vier fachliche Rollen mit fester Rechtematrix (Empfehlung)**

Rollen als Enum auf `StaffMembership.role`:

1. `ADMIN` – Vollzugriff (Grillkoordination).
2. `KOORDINATION` – wie Admin ohne: Organisationseinstellungen, Rollenverwaltung, Import, Koordinationszeit anderer. Vorgesehen für eine Stellvertretung.
3. `KIOSK` – liest veröffentlichte Einsätze inkl. Namen und Telefonnummern der eingetragenen Helfer der eigenen Events; keine Familien-, Stunden- oder Auszahlungsdaten.
4. `VORSTAND_LESEN` – liest Auswertungen und Saisonstände (aggregiert); keine Kontaktdaten; Exporte ohne Kontaktdaten.

Das bereits vorhandene Feld `scope` bleibt ungenutzt reserviert (z. B. spätere Einschränkung auf bestimmte Saisons oder Module).

- Pro: Deckt alle in D-018/PRD 5.12 genannten Gruppen ab, ohne ein Rechte-Editor-UI zu benötigen; die Matrix ist klein genug für vollständige serverseitige Tests; «Vorstand kann später eine Lese-/Exportrolle erhalten» (PRD) wird ohne Umbau möglich – die Rolle existiert, sie wird nur bei Bedarf vergeben.
- Contra: Vier Rollen sind mehr Testfläche als zwei; die Rechtematrix muss als Dokument gepflegt werden (siehe unten).
- Langzeitfolge: Neue Module (Backlog: Kiosk, Fahrdienst) fügen Zeilen zur Matrix hinzu, keine neuen Mechanismen. Erst echte Multi-Tenant- oder Selbstverwaltungs-Anforderungen würden ein konfigurierbares Rechtesystem rechtfertigen – ausdrücklich nicht Version 1.

**Option C – Feingranulare Permissions (Rolle = Bündel einzelner Rechte)**

- Pro: Maximale Flexibilität; kein späterer Umbau.
- Contra: Klassisches Over-Engineering für einen Verein mit einer Handvoll Berechtigter; braucht Verwaltungs-UI, Migrationspfade für Rechteänderungen und deutlich mehr Tests; verstösst gegen das Verbot unnötiger Multi-Tenant-Komplexität im Geist von D-015.
- Langzeitfolge: Dauerhafte Komplexität, die in Version 1 niemandem nützt.

### Empfehlung

**Option B.** Zusatzbeschluss: Die Rechtematrix (Rolle × Ressource × Aktion) wird als eigene Tabelle in `docs/PERMISSIONS.md` gepflegt und ist die verbindliche Vorlage für die serverseitigen Guards und deren Tests. Version 1 vergibt aktiv nur `ADMIN` und `KIOSK`; `KOORDINATION` und `VORSTAND_LESEN` existieren im Code, werden aber erst bei Bedarf zugewiesen.

---

## RFC-006 – Status-Enums und Zustandsübergänge

**Status:** beschlossen (D-026)
**Blockiert:** Sprint 1 (Schema), Sprint 2/3 (Statusanzeigen)
**Bezug:** `docs/DATA_MODEL.md`, UX_UI (Statusbeispiele), PRD 5.4/5.5/5.10

### Problem

`Season.status` ist im PRD definiert (Entwurf, aktiv, abgeschlossen, archiviert) und `Payment.status` in BR-003 (offen, freigegeben, ausbezahlt). Für `Event.status`, `Shift.status` und `Signup.status` existieren nur Beispiele in UX_UI («Anmeldung geschlossen», «Termin verschoben»), aber keine beschlossene Aufzählung und keine erlaubten Übergänge.

### Warum es wichtig ist

Enums sind Migrationsmaterie: nachträgliche Änderungen erzeugen Datenmigrationen und berühren jede Statusanzeige, jeden Filter («offene Plätze»), den öffentlichen Plan und den Admin-Handlungsbedarf. Undefinierte Übergänge führen zu inkonsistenten Zuständen (z. B. Anmeldungen auf abgesagten Events).

### Optionen

**Option A – Minimalistisch: nur die zwingend nötigen Werte, Rest über abgeleitete Anzeige (Empfehlung)**

Grundsatz: Gespeichert wird nur, was nicht ableitbar ist. «Vollständig besetzt» und «Noch 1 Platz frei» sind keine Status, sondern werden aus Belegung berechnet; «Anmeldung geschlossen» ist bei Schichten ein echter Status, weil Admin sie unabhängig von der Belegung schliessen können muss.

Vorschlag:

- `Event.status`: `ENTWURF | VEROEFFENTLICHT | VERSCHOBEN | ABGESAGT | ABGESCHLOSSEN`
  Übergänge: ENTWURF→VEROEFFENTLICHT; VEROEFFENTLICHT→VERSCHOBEN (mit neuem Datum, Signups bleiben bestehen, Betroffene werden informiert – PRD 5.13) | →ABGESAGT (aktive Signups werden mit Grund storniert) | →ABGESCHLOSSEN. VERSCHOBEN→VEROEFFENTLICHT nach Bestätigung des neuen Termins.
- `Shift.status`: `OFFEN | GESCHLOSSEN | ABGESAGT` (Entwurf/veröffentlicht erbt die Schicht vom Event; «voll» ist berechnet)
- `Signup.status`: `AKTIV | STORNIERT_HELFER | STORNIERT_ADMIN`
  plus – abhängig von RFC-001 – `Signup.outcome`: `OFFEN | ERSCHIENEN | ENTSCHULDIGT_ABGESAGT | KURZFRISTIG_ABGESAGT | NICHT_ERSCHIENEN | ERSATZ_ORGANISIERT`. Statuskette (aktiv/storniert) und Ausgang (was am Einsatztag geschah) sind bewusst getrennte Dimensionen.
- `Season.status` und `Payment.status`: wie bereits beschlossen, unverändert.

- Pro: Kein Status kann der Belegungsrealität widersprechen; kleine, vollständig testbare Übergangsdiagramme; die UX-Beispieltexte bleiben als berechnete Anzeigen exakt umsetzbar.
- Contra: Entwickler müssen die Trennung «gespeicherter Status vs. berechnete Anzeige» verstehen und dokumentiert halten; zwei Felder auf Signup (status + outcome) statt einem.
- Langzeitfolge: Berechnete Anzeigen passen sich künftigen Regeln automatisch an; die Enums selbst bleiben stabil.

**Option B – Reichhaltige Status inkl. Belegungszuständen (`VOLL`, `FAST_VOLL` …)**

- Pro: Statusfeld direkt anzeigbar, keine Berechnung.
- Contra: Redundanz zur Belegung erzeugt garantiert Inkonsistenzen (Race: letzte Absage vs. Statusfeld); jede Buchung/Absage muss Status nachführen; verletzt die Constraint-Logik aus BR-005 im Kern.
- Langzeitfolge: Dauerquelle von Anzeige-Bugs («zeigt voll, ist aber frei»).

### Empfehlung

**Option A**, festgehalten mit Zustandsdiagrammen (Mermaid) im DATA_MODEL nach Beschluss. Deutschsprachige Enum-Bezeichner sind hier bewusst gewählt worden? Nein – Klarstellung als Teil des Beschlusses nötig: Ich empfehle **englische technische Enum-Werte** (`DRAFT`, `PUBLISHED`, …) mit deutschen Anzeigetexten über die ohnehin vorbereitete Übersetzungsschicht (D-014), damit Code und künftige Internationalisierung konsistent bleiben. Die obigen deutschen Namen sind als fachliche Bedeutung zu lesen.

---

## RFC-007 – Öffentliche Namensanzeige und Einwilligung importierter Helfer

**Status:** beschlossen (D-027)
**Blockiert:** Sprint 3 (öffentlicher Plan), Sprint 8 (Import); Schemafeld schon in Sprint 1 sinnvoll
**Bezug:** D-005, BR-005, BR-010, PRD 5.2, revidiertes DSG

### Problem

Bei der Selbst-Eintragung stimmt der Helfer der öffentlichen Namensanzeige aktiv zu (PRD 5.2). Importierte Bestandshelfer und von Admin manuell erfasste Helfer haben diese Zustimmung nie erteilt. Bucht Admin sie in eine künftige Schicht, erschiene ihr voller Name öffentlich ohne Einwilligung.

### Warum es wichtig ist

Das ist eine Rechtsfrage (revidiertes Datenschutzgesetz), keine Geschmacksfrage. Gleichzeitig darf die Lösung D-005 (volle Namen im öffentlichen Plan) für den Normalfall nicht aushöhlen und die Koordination nicht mit Bürokratie belasten.

### Optionen

**Option A – Einwilligung als Zeitstempel pro Helfer; ohne Einwilligung abgekürzte Anzeige (Empfehlung)**

Neues Feld `Volunteer.publicDisplayConsentAt` (nullable). Selbst-Eintragung setzt es automatisch (die Zustimmung ist Teil des Formulars, D-004/PRD 5.2 unverändert). Bucht Admin einen Helfer ohne Einwilligung, zeigt der öffentliche Plan «Vorname N.» statt des vollen Namens; Staff und Admin sehen weiterhin alles. Die Einwilligung kann nachgeholt werden: über den Verwaltungslink der Anmeldung, bei der nächsten Selbst-Eintragung oder mündlich gegenüber Admin (Admin setzt das Feld, protokolliert per AuditEvent).

- Pro: Rechtskonform ohne Sonderprozesse; D-005 bleibt für den Regelfall (Selbst-Eintragung) vollständig erhalten; der Plan bleibt lesbar («Vorname N.» genügt sozial meist zur Erkennung); einmalige, billige Schemaergänzung; keine Blockade des Imports.
- Contra: Zwei Anzeigevarianten im öffentlichen Plan; Admin muss das Konzept kennen; «Vorname N.» kann bei häufigen Vornamen mehrdeutig sein (unkritisch, da Staff die Auflösung sieht).
- Langzeitfolge: Das Einwilligungsdatum ist auch für spätere Anforderungen (Auskunftsbegehren, Widerruf) der richtige Anker. Ein Widerruf ist als Löschen des Zeitstempels trivial abbildbar.

**Option B – Ohne Einwilligung gar keine Namensanzeige («1 Platz belegt»)**

- Pro: Maximal konservativ.
- Contra: Der öffentliche Plan verliert seinen sozialen Nutzen («mit wem grilliere ich?» ist laut Excel-Praxis relevant); anonyme belegte Plätze wirken wie Systemfehler; übererfüllt die rechtliche Anforderung zulasten der UX.
- Langzeitfolge: Druck, die Regel wieder aufzuweichen – Regeln, die man plant zu brechen, sollte man nicht beschliessen.

**Option C – Einwilligung aktiv einholen, Anzeige erst danach (E-Mail-Kampagne beim Import)**

- Pro: Sauberste Form der Einwilligung.
- Contra: Massenmail an Bestandsadressen unklarer Qualität (IMPORT.md: fehlende/geteilte Kontakte) mit erwartbar niedriger Rücklaufquote; bis dahin gilt faktisch Option B; hoher Koordinationsaufwand vor dem ersten Nutzen der App.
- Langzeitfolge: Einmalaufwand ohne bleibenden Mechanismus – das Feld aus Option A bräuchte es trotzdem.

### Empfehlung

**Option A.** Sie präzisiert D-005, statt ihn zu ändern: Volle Namen bleiben der Normalfall; die Abkürzung ist der dokumentierte Ausnahmefall für fehlende Einwilligung. Als Teil desselben Beschlusses: Kinderdaten (Name, Mannschaft) werden ausdrücklich in BR-010 als «niemals öffentlich» ergänzt – das ist heute implizit, sollte aber schriftlich sein.

---

## RFC-008 – Rundung von Auszahlungsbeträgen

**Status:** beschlossen (D-028)
**Blockiert:** Sprint 6 (Auszahlung); Berechnungsregel gehört in die Geschäftsregel-Tests ab Sprint 1
**Bezug:** BR-003, BR-004, CLAUDE.md (Rappen als Ganzzahl)

### Problem

Betrag = Dauer (Minuten) × Stundensatz (Rappen) ÷ 60. Beim aktuellen Satz von 900 Rp/h ergibt jede Minute exakt 15 Rp – zufällig ganzzahlig. Der Satz ist aber konfigurierbar: Bei z. B. 950 Rp/h entstehen Bruchteile (15.83 Rp/min). Es fehlt eine Rundungsregel. Zusätzlich: Barauszahlungen sind in der Schweiz praktisch auf 5 Rappen gerundet.

### Warum es wichtig ist

Geldbeträge müssen deterministisch, auditierbar und in Summe widerspruchsfrei sein. Ohne definierte Regel entscheidet die Implementierung zufällig (Truncation vs. Rundung, pro Record vs. pro Summe) – genau die Sorte stiller Abweichung, die beim Saisonabschluss Diskussionen erzeugt.

### Optionen

**Option A – Kaufmännische Rundung auf 1 Rappen pro WorkRecord (Empfehlung)**

`amountRappen = round(durationMinutes × rateRappenPerHour / 60)`, gespeichert pro Payment (Feld existiert bereits). Auszahlungssummen sind schlichte Additionen gespeicherter Ganzzahlen.

- Pro: Deterministisch und pro Einsatz nachvollziehbar («dieser Einsatz war 4725 Rp wert»); Summen über beliebige Gruppierungen (Helfer, Saison, Vereinsjahr) sind immer konsistent, weil nie neu gerechnet wird; maximale Abweichung pro Record ±0.5 Rp, praktisch irrelevant; einfachste Testbarkeit.
- Contra: Eine Gesamtsumme kann um wenige Rappen von einer «erst summieren, dann runden»-Rechnung abweichen (mathematisch unvermeidbar bei jeder Variante; hier ist die Abweichung wenigstens erklärbar pro Einsatz).
- Langzeitfolge: Die Regel überlebt jede Satzänderung und jede neue Auswertung unverändert.

**Option B – Exakte Bruchrechnung speichern, Rundung erst bei Auszahlung**

- Pro: Keine Rundungsdifferenz bis zum Schluss.
- Contra: Verletzt die beschlossene Regel «Geldwerte als Ganzzahl in Rappen» (CLAUDE.md) oder erzwingt Zehntelsrappen-Ganzzahlen als neue Einheit; jede Zwischenanzeige (Dashboard «offene Auszahlungen») müsste runden, ohne dass der gerundete Wert je gespeichert ist – Anzeige und späterer Auszahlungsbetrag können differieren; deutlich fehleranfälliger.
- Langzeitfolge: Eine zweite Geldeinheit im System ist ein dauerhaftes Missverständnisrisiko.

**Option C – Zusätzlich Bargeldrundung der Auszahlungssumme auf 5 Rappen**

- Pro: Entspricht der Münzrealität bei Barauszahlung.
- Contra: Erzeugt eine ausgewiesene Differenz zwischen Summe der Einzelbeträge und ausbezahltem Betrag; ob überhaupt bar ausbezahlt wird, ist nicht dokumentiert; Komplexität ohne bestätigten Bedarf.
- Langzeitfolge: Falls nötig, jederzeit als reine Anzeigefunktion beim Auszahlungsvorgang nachrüstbar – erfordert keine Schemaentscheidung jetzt.

### Empfehlung

**Option A** als beschlossene Regel, mit explizitem Testfall-Katalog (u. a. 50 min × 950 Rp/h). Option C wird ins Backlog gestellt, bis geklärt ist, ob Auszahlungen bar oder per Überweisung erfolgen. Zusatzbeschluss zur Vollständigkeit von BR-003: Der Stundensatz wird beim **Freigeben** der Auszahlung (Status → APPROVED) eingefroren und in `Payment.rateRappenPerHour` festgeschrieben; spätere Änderungen des Standardsatzes wirken nur auf noch nicht freigegebene Auszahlungen.

---

## RFC-009 – Präzise Definition der Sieben-Tage-Absageregel

**Status:** beschlossen (D-029)
**Blockiert:** Sprint 3 (Absagefunktion); Geschäftsregel-Tests
**Bezug:** D-006, BR-006, PRD Kernablauf Schritt 8/9

### Problem

D-006 sagt «sieben **volle** Tage vor Schichtbeginn», das PRD verkürzt auf «sieben Tage». Offen ist die exakte Berechnung: reine Timestamp-Arithmetik (Beginn minus 168 Stunden) oder Kalendertage in Europe/Zurich? Beispiel Schicht Samstag 18:00: Ist Absage am Vorsamstag um 17:59 noch zulässig? Zudem: Verhalten bei Sommerzeitwechsel innerhalb der Frist.

### Warum es wichtig ist

Die Regel wird Helfern gegenüber kommuniziert und im Streitfall herangezogen. Sie muss ohne Erklärung verständlich, sekundengenau implementierbar und DST-sicher sein. Eine Formulierung, die Entwickler und Helfer unterschiedlich verstehen, ist schlimmer als jede der beiden Varianten.

### Optionen

**Option A – Timestamp-Regel: Absage zulässig bis exakt 7 × 24 h vor Schichtbeginn**

- Pro: Eine Codezeile; keine Kalenderlogik; DST-neutral in der Implementierung (UTC-Arithmetik).
- Contra: Der Cutoff fällt auf krumme Uhrzeiten («absagen bis Samstag 18:00») und variiert pro Schicht – schwerer zu merken; «volle Tage» aus D-006 wird eher grosszügig als wörtlich interpretiert; über einen DST-Wechsel hinweg sind es lokal 167 oder 169 Stunden, was Erklärungen («warum genau 17:00?») provoziert.
- Langzeitfolge: Funktional unproblematisch, kommunikativ dauerhaft leicht sperrig.

**Option B – Kalendertagsregel in Europe/Zurich (Empfehlung)**

Zwischen dem Kalendertag der Absage und dem Kalendertag des Schichtbeginns müssen mindestens sieben volle Kalendertage liegen. Formal: Absage zulässig bis 23:59:59 Europe/Zurich des Tages, der acht Tage vor dem Schichttag liegt. Beispiel: Schicht am Samstag, 25. April → Selbstabsage bis Freitag, 17. April, 23:59 Uhr; ab Samstag, 18. April, verweist die App auf die Koordination.

- Pro: Entspricht wörtlich D-006 («sieben volle Tage»); der Stichtag ist ein ganzer Kalendertag und damit für jede Zielgruppe merkbar; die App zeigt die konkrete Frist ohnehin bei jeder Anmeldung und im Verwaltungslink an («Selbst absagen möglich bis Fr, 17.04.2026»); DST-sicher, weil über Mitternacht der Zeitzone gerechnet wird, nicht über Stundendifferenzen.
- Contra: Implementierung braucht Zeitzonen-Kalenderlogik statt einfacher Subtraktion (überschaubar, aber testpflichtig – inkl. der beiden Umstellungsnächte); für sehr späte Schichten (23:30) ist die Frist minim strenger als 168 h.
- Langzeitfolge: Die Regel ist in einem Satz an Helfer kommunizierbar und bleibt es. Kalenderlogik in Europe/Zurich wird ohnehin an mehreren Stellen gebraucht (Dashboard-Zeiträume 7/14/30 Tage) – die Investition amortisiert sich.

### Empfehlung

**Option B**, mit drei verbindlichen Zusätzen im selben Beschluss: (1) Die konkrete Absagefrist wird bei Bestätigung, im Verwaltungslink und in Erinnerungen immer als Datum angezeigt – niemand muss rechnen. (2) Nach Ablauf zeigt die App aktiv die Kontaktmöglichkeiten der Koordination (BR-006 bleibt unverändert). (3) Die Geschäftsregel-Tests enthalten Fälle für Mitternachtsschichten und beide DST-Wechsel.

---

## RFC-010 – Missbrauchs- und Spam-Schutz der öffentlichen Eintragung

**Status:** beschlossen (D-030)
**Blockiert:** Sprint 3
**Bezug:** BR-005, PRD 5.2, UX-Ziele (barrierearm, sekundenschnell), RFC-002

### Problem

Ein öffentliches, loginfreies Formular nimmt personenbezogene Daten entgegen und reserviert – nach Empfehlung RFC-002 – sofort verbindlich Plätze. Ohne Schutz können Bots oder Scherzbolde Plätze blockieren und die Datenbank mit Müll füllen. Kein Dokument adressiert das bisher.

### Warum es wichtig ist

Blockierte Plätze sind der maximale Schaden für den Produktzweck (offene Plätze sichtbar und buchbar). Gleichzeitig verbietet die Zielgruppe faktisch jede Hürde, die einen 70-jährigen Helfer am Handy scheitern lässt. Der Schutz muss unsichtbar sein.

### Optionen

**Option A – Unsichtbare Massnahmen: Honeypot + serverseitiges Rate-Limiting + Plausibilitätsprüfung (Empfehlung)**

Konkret: (1) Honeypot-Feld und Mindest-Ausfüllzeit gegen simple Bots. (2) Serverseitiges Rate-Limit pro IP und – wichtiger – pro normalisierter Telefonnummer/E-Mail (z. B. maximal N aktive Anmeldungen pro Kontakt und Zeitfenster; Grenzwerte konfigurierbar in den Organisationseinstellungen). (3) Serverseitige Formatvalidierung von Telefonnummer und E-Mail (ohnehin Pflicht laut CLAUDE.md). (4) Auffällige Häufungen erscheinen im Admin-Handlungsbedarf; Admin kann Anmeldungen mit einem Klick stornieren (existiert bereits fachlich via BR-006).

- Pro: Für legitime Nutzer vollständig unsichtbar; keine externen Dienste, keine Cookies, keine Datenweitergabe (datenschutzfreundlich); dem realen Bedrohungsniveau eines Vereinsplans angemessen; alle Bausteine sind Standardtechnik ohne Zusatzkosten.
- Contra: Hält keinen gezielten, motivierten Angreifer auf (den hält aber auch ein CAPTCHA kaum); Rate-Limits brauchen sinnvolle Grenzwerte und eine Umgehung für den legitimen Fall «eine Person trägt die ganze Familie ein» (Grenzwerte entsprechend grosszügig wählen); IP-Limits sind in Mobilfunknetzen (CGNAT) unscharf – deshalb ist das Kontakt-basierte Limit das primäre.
- Langzeitfolge: Wartungsarm. Sollte realer Missbrauch auftreten, sind Option-B-Massnahmen additiv nachrüstbar, ohne UX-Versprechen zu brechen.

**Option B – CAPTCHA (z. B. Turnstile/hCaptcha)**

- Pro: Wirksam gegen Standard-Bots; ausgelagerte Pflege.
- Contra: Direkter Konflikt mit den beschlossenen UX-Prinzipien (barrierearm, für Jung und Alt, sekundenschnell); externe Abhängigkeit und Datenfluss an Dritte (BR-010-Geist); scheiternde CAPTCHA-Interaktionen älterer Nutzer sind ein bekanntes, reales Problem; für das Bedrohungsniveau überdimensioniert.
- Langzeitfolge: Jede künftige Barrierefreiheitsprüfung (Sprint 9) stolpert darüber.

**Option C – SMS-Verifikation der Telefonnummer**

- Pro: Starke Identitätsbindung; verhindert Fremdeintragungen weitgehend.
- Contra: Kostenpflichtige SMS sind für Version 1 ausdrücklich ausgeschlossen (PRD 5.13); zusätzliche Hürde im Kernablauf; internationaler Versand, Zustellprobleme, laufende Kosten.
- Langzeitfolge: Steht im Backlog-Bereich besser auf («später»), falls Missbrauch je nachweisbar wird.

### Empfehlung

**Option A.** Sie ist die einzige Variante, die Schutz bietet, ohne ein einziges beschlossenes Produktprinzip zu verletzen. Als Teil des Beschlusses: Die Grenzwerte werden nicht hart codiert, sondern in den Organisationseinstellungen geführt (Sprint-1-Umfang enthält Organisationseinstellungen bereits), und der Admin-Handlungsbedarf erhält die Kategorie «auffällige Anmeldungen».

---

## Anhang – Abhängigkeiten zwischen den RFCs

- RFC-001 und RFC-006 gehören zusammen beschlossen (Signup-Felder `status`/`outcome`).
- RFC-002 bestimmt, ob RFC-006 einen Schwebezustand (`PENDING`) braucht – bei Empfehlung A: nein.
- RFC-003 bestätigt, dass kein Split-Mechanismus ins Sprint-1-Schema muss; die Empfehlung zu RFC-001 (Signup → mehrere WorkRecords nur im Korrekturweg) deckt den Härtefall ab.
- RFC-007 ergänzt ein Volunteer-Feld und sollte deshalb trotz Sprint-3-Bezug vor Sprint 1 beschlossen werden.
- RFC-008 und RFC-009 sind reine Regelentscheide ohne Schemafolgen, gehören aber ab Sprint 1 in den Geschäftsregel-Testkatalog.

## Anhang – Nach Beschluss zu erledigen

1. Gewählte Optionen als D-021 ff. in `docs/DECISIONS.md` dokumentieren (Prozess gemäss D-020).
2. `docs/DATA_MODEL.md` anpassen (Signup.outcome, WorkRecord.signupId Pflicht, Volunteer.publicDisplayConsentAt, Volunteer.mergedIntoId gemäss Review, Enum-Definitionen mit Zustandsdiagrammen).
3. `docs/BUSINESS_RULES.md` ergänzen (Überschussregel, Rundungsregel, präzisierte Absagefrist, Kinderdaten niemals öffentlich, Satz-Einfrierzeitpunkt).
4. `docs/PERMISSIONS.md` mit der Rechtematrix anlegen.
5. Backlog ergänzen: Verfallsmechanismus unbestätigter Anmeldungen, 5-Rappen-Bargeldrundung, SMS-Verifikation, systemgestützter WorkRecord-Split.
