# Decision Log

## D-001 – Erste Einsatzart
**Status:** beschlossen  
Version 1 startet mit Grilleinsätzen. Das Datenmodell verwendet allgemeine Events und Schichten, damit später weitere Vereinsarbeiten ergänzt werden können.

## D-002 – Terminimport
**Status:** beschlossen  
Events werden zu Beginn manuell erfasst. Ein Import aus Planungsdateien folgt später.

## D-003 – Schichtvorschläge
**Status:** beschlossen  
Version 1 erlaubt manuelle Schichten und wiederverwendbare Vorlagen. Automatische Vorschläge können später aus vorhandenen Mustern entstehen.

## D-004 – Pflichtdaten
**Status:** beschlossen  
Vorname, Nachname, Telefonnummer und E-Mail sind bei jeder Eintragung erforderlich.

## D-005 – Öffentliche Sichtbarkeit
**Status:** beschlossen  
Vollständige Namen eingetragener Helfer sind im öffentlichen Plan sichtbar. Telefonnummern und E-Mail-Adressen sind nur für berechtigte Staff- und Adminrollen sichtbar.

## D-006 – Absagefrist
**Status:** beschlossen  
Selbstständige Absage ist bis sieben volle Tage vor Schichtbeginn möglich. Danach muss die Koordination kontaktiert werden.

## D-007 – Registrierung
**Status:** beschlossen  
Helfer dürfen sich ohne Konto eintragen. Ein freiwilliges Konto ermöglicht Datenübernahme, eigene Einsätze und Stundenansicht.

## D-008 – Vergütungsart
**Status:** beschlossen  
Vergütungsart wird pro Einsatz gewählt. Die Wahl kann vorläufig bei der Eintragung und endgültig nach dem Einsatz bestätigt werden.

## D-009 – Saisonstruktur
**Status:** beschlossen  
Herbst und Frühling sind separat sichtbar und werden in einem Vereinsjahr gemeinsam ausgewertet.

## D-010 – Einsatzabschluss
**Status:** beschlossen  
Der Helfer kann effektive Zeiten selbst erfassen. Admin kann Daten aus Papierlisten nachtragen oder korrigieren.

## D-011 – Familienkonto
**Status:** beschlossen  
Mehrere Helfer können Stunden für dieselbe Familie leisten. Helfer und begünstigte Familie sind getrennte Objekte.

## D-012 – Sollstunden
**Status:** beschlossen  
Standard pro Vereinsjahr: ein Kind 8 Stunden, zwei oder mehr Kinder 12 Stunden.

## D-013 – Eigene Koordinationszeit
**Status:** beschlossen  
Die Koordinationsarbeit wird in der App erfasst und ist nur für Admin sichtbar.

## D-014 – Sprache
**Status:** beschlossen  
Version 1 ist deutsch. Die technische Struktur wird von Anfang an übersetzbar aufgebaut.

## D-015 – Produktumfang
**Status:** beschlossen  
Version 1 wird für den FC Thusis-Cazis entwickelt. Eine spätere Nutzung durch andere Vereine bleibt möglich, wird aber nicht als vollständige Multi-Tenant-SaaS in Version 1 umgesetzt.

## D-016 – Hosting
**Status:** beschlossen  
Entwicklung zunächst lokal. Produktivbetrieb später bei einem Hostinganbieter mit HTTPS, E-Mail-Versand und Backups.

## D-017 – Produktname
**Status:** beschlossen  
Die Vereinsinstanz heisst GrillCrew FCTC.

## D-018 – Staff-Zugriff
**Status:** beschlossen  
Staff umfasst Kioskteam, Grillkoordination, Vorstand und weitere berechtigte Verantwortliche. Der Zugriff wird rollenbasiert und möglichst auf notwendige Daten begrenzt.

## D-019 – Erscheinungsstatus
**Status:** beschlossen  
Admin kann erschienen, entschuldigt abgesagt, kurzfristig abgesagt, nicht erschienen und Ersatz organisiert dokumentieren.

## D-020 – Quelle der Wahrheit
**Status:** beschlossen  
Das Repository ist die Single Source of Truth. Produktentscheidungen werden dokumentiert, bevor sie umgesetzt werden.
