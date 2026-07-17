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

## Später
- weitere Module: Kiosk, Kuchen, Fahrdienst, Turniere, Platzdienst
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
