# Backlog – nicht automatisch Version 1

## Nahe Zukunft
- Event- und Schichtvorlagen
- Saison aus Vorjahr kopieren
- allgemeiner Excel-Import-Assistent
- Warteliste für volle Schichten
- Einsatz zur Übernahme freigeben
- QR-Code pro Plan/Event
- automatische E-Mail-Erinnerungen
- PDF-Export
- weitere Staff-Sichtbereiche
- Verfallsmechanismus für unbestätigte Anmeldungen nur bei realem Bedarf
- 5-Rappen-Bargeldrundung für Auszahlungsvorgänge
- systemgestützter WorkRecord-Split
- Same-Site-BFF-/Proxy-Architektur fuer Auth-Cookies (Next.js-Rewrite zu Render), falls der
  Wartungsaufwand des dynamischen Origin-Allowlists (D-039) real spuerbar wird
- "Konto einladen"-Aktion fuer einen admin-angelegten Helfer ohne `user_id`: die bestehende
  `Invitation`-Infrastruktur (`backend/app/services/invitation.py`) ist an eine `StaffRole` und
  `StaffMembership` gebunden und daher fuer ein reines Helferkonto ohne Admin-/Koordinationsrechte
  nicht direkt wiederverwendbar; ein eigener, rollenloser Token-/Akzeptanzfluss (oder eine explizite
  Erweiterung von `Invitation` um einen optionalen Rollen-Wert) braucht eine eigene Produktentscheidung,
  bevor er umgesetzt wird. Bis dahin zeigt die Helfer-Detailansicht bei fehlendem Konto nur einen
  Hinweistext statt einer Aktion.

## Nach Domain-/Landingpage-Umbau (D-053)

- Bewerbungen (`volunteer-interest`) im Adminbereich als Liste sichtbar machen (aktuell v1:
  reine E-Mail-Benachrichtigung an ADMIN/KOORDINATION-Staff, keine Persistenz).
- Domain-Umzug selbst (Custom Domain in Vercel, `FRONTEND_PUBLIC_URL`/`CORS_ALLOWED_ORIGINS`
  auf Render) ist eigenständige Infra-Aufgabe, sobald Domain/Marke entschieden sind.

## Später
- Kiosk-Modul: feste Zuteilungsmatrix (Datum x Person), eigene Schichterzeugung aus
  Kiosk-Öffnungszeiten, Darstellung im bestehenden Kalender. Datenmodell-Grundlage
  (`shift_type`/`assignment_mode`) wird ab Phase 3 der Grill-Digitalisierung mitgebaut (D-041),
  das Kiosk-Modul selbst folgt separat.
- KI-Unterstützung (Gemini, kostenloses API-Kontingent) für z. B. Besetzungsvorschläge oder
  Spielanalyse. Anwendungsfall noch nicht konkret definiert.
- digitale Unterschrift für Auszahlungen (löst die papierbasierte Bestätigung aus D-041 Punkt 8 ab).
- Sollstunden-Materialisierung (`FamilyRequirement`, BR-001/D-024): eigenes Datenmodell,
  Einfrier-/Override-Mechanismus und Erfüllungsanzeige - benötigt eine eigene Entscheidung, bevor
  implementiert wird.
- weitere Module: Kuchen, Fahrdienst, Turniere, Platzdienst
- Multi-Verein-/Mandantenfähigkeit
- vollständig automatisierte WhatsApp-Business-Nachrichten
- SMS
- SMS-Verifikation für öffentliche Eintragung
- Push-Nachrichten
- Offline-Modus für Einsatzabschluss
- Wetterinformationen
- Bestands-/Einkaufsnotizen
- wiederkehrende Muster und Planungsvorschläge
- Helferpräferenzen und kurzfristige Verfügbarkeit
- Badges/Gamification nur nach bewusster Entscheidung
- KI-gestützte Vorschläge erst nach ausreichender Datenbasis

## Ausdrücklich nicht für Version 1
- native iOS-/Android-App
- öffentlich sichtbare Kontaktdaten
- automatische negative Helferbewertung
- komplexes SaaS-Abrechnungssystem

## Repository / Workflow
- workflow:start needs a product-feature mode so it does not generate process-only prompts for
  auth/API/database work.

## Security Hardening
- `POST /api/auth/reset-password` has no dedicated D-038 rate-limit bucket (unlike
  `/forgot-password`, which is limited per account and per IP). Deferred because the reset token is a
  256-bit random value (`secrets.token_urlsafe(32)`), making brute-force guessing infeasible regardless
  of rate limiting, and D-038's ratified wording names "password-reset request," not submission, as the
  action requiring its own limit. Add a `password_reset_submit_per_ip` limit if this needs revisiting.
# Nach Phase 4B

- Saisonend-Export/Report fuer Koordinationszeit und Helferarbeit bleibt eine eigene spaetere Phase.
- Digitale Unterschriften bleiben ausgeschlossen; Phase 4B speichert nur einen manuellen
  Papier-Unterschrift-erhalten-Vermerk.
## Nach Kiosk-/Grillvorschläge Phase 1

- Externen aktuellen Kiosk-Excelplan erst nach Bereitstellung des Koordinator-Dokuments importieren und mit den abgeleiteten Vorschlägen vergleichen.
- Vorschläge erst nach einem eigenen genehmigten Workflow in bestätigte Schichten beziehungsweise öffentliche Anmeldungen überführen.
# Operations follow-up: production due-sync invocation

- Vor Aktivierung in Produktion `ONEDRIVE_CRON_TOKEN` als mindestens 32 Zeichen langes Deployment-Secret setzen und einen täglichen Bearer-authentifizierten Aufruf von `POST /api/cron/onedrive-sync/run-due` konfigurieren. Solange dies fehlt, zeigt die UI nur die Vorschau; sie darf keinen erfolgreichen geplanten Lauf vortäuschen.
