# Fachliches Datenmodell

## Übersicht

```mermaid
erDiagram
  ORGANIZATION ||--o{ CLUB_YEAR : has
  CLUB_YEAR ||--o{ SEASON : contains
  SEASON ||--o{ EVENT : contains
  EVENT ||--o{ SHIFT : contains
  SHIFT ||--o{ SIGNUP : receives
  VOLUNTEER ||--o{ SIGNUP : makes
  SIGNUP ||--o{ WORK_RECORD : becomes
  FAMILY ||--o{ CHILD : contains
  FAMILY ||--o{ FAMILY_MEMBER : has
  VOLUNTEER ||--o{ FAMILY_MEMBER : linked
  FAMILY ||--o{ WORK_RECORD : credited
  WORK_RECORD ||--o| PAYMENT : may_create
  ADMIN_USER ||--o{ COORDINATION_LOG : records
  ORGANIZATION ||--o{ STAFF_MEMBERSHIP : grants
```

## Kernentitäten

### Organization
Für Version 1 genau eine Organisation, technisch trotzdem eigene Entität.
- id
- name
- shortName
- timezone
- locale
- logo
- primaryColor
- accentColor
- settings

### ClubYear
Beispiel 2026/2027.
- id
- organizationId
- label
- startDate
- endDate
- status

### Season
Teil-Saison innerhalb eines Vereinsjahres.
- id
- clubYearId
- type: AUTUMN | SPRING | OTHER
- name
- startDate
- endDate
- status

### Event
Ein Heimspieltag, Turnier, Cupspiel oder anderer Anlass.
- id
- seasonId
- title
- date
- location
- eventType
- publicDescription
- internalNote
- status
- publishedAt
- sourceImportId

### Shift
Konkreter Einsatzzeitraum.
- id
- eventId
- startsAt
- endsAt
- requiredVolunteers
- publicNote
- internalNote
- status
- sortOrder

### Volunteer
Natürliche Person, unabhängig davon, ob ein Konto besteht.
- id
- firstName
- lastName
- phoneNormalized
- phoneDisplay
- emailNormalized
- emailDisplay
- preferredLanguage
- accountUserId nullable
- publicDisplayConsentAt nullable
- mergedIntoId nullable
- status
- internalNote
- createdFrom: PUBLIC_SIGNUP | IMPORT | ADMIN

### Signup
Reservierung eines Helferplatzes.
- id
- shiftId
- volunteerId
- provisionalCompensationType
- provisionalFamilyId nullable
- publicNameSnapshot
- status: ACTIVE | CANCELLED_BY_VOLUNTEER | CANCELLED_BY_ADMIN
- outcome: OPEN | ATTENDED | EXCUSED_CANCELLED | LATE_CANCELLED | NO_SHOW | SUBSTITUTE_ORGANIZED
- managementTokenHash
- confirmedAt
- cancelledAt
- cancellationReason
- source

### WorkRecord
Tatsächlich geleistete Arbeit.
- id
- signupId
- shiftId
- volunteerId
- actualStart
- actualEnd
- breakMinutes
- durationMinutes
- finalCompensationType
- creditedFamilyId nullable
- submittedByVolunteerAt
- confirmedByAdminAt
- source: DIGITAL | PAPER | IMPORT
- note

### Family
Gemeinsames Sollstundenkonto.
- id
- organizationId
- displayName
- status
- internalNote

### Child
- id
- familyId
- firstName
- lastName
- team
- activeFrom
- activeUntil

### FamilyMember
Zuordnung von Helfer zu Familie.
- id
- familyId
- volunteerId
- relationship
- verifiedAt
- isPrimaryContact

### FamilyRequirement
Sollwert pro Vereinsjahr.
- id
- familyId
- clubYearId
- requiredMinutes
- reason
- source: DEFAULT | OVERRIDE

### Payment
- id
- workRecordId
- rateRappenPerHour
- amountRappen
- status: OPEN | APPROVED | PAID
- paidAt
- note

### CoordinationLog
Nur Admin sichtbar.
- id
- adminUserId
- seasonId
- date
- durationMinutes
- activityType
- note
- rateRappenPerHour
- paymentStatus

### StaffMembership
- id
- organizationId
- userId
- role: ADMIN | KOORDINATION | KIOSK | VORSTAND_LESEN
- active
- scope optional

### AuditEvent
- id
- actorType
- actorId
- action
- entityType
- entityId
- previousData
- newData
- createdAt

### ImportBatch
- id
- filename
- fileHash
- importType
- status
- importedAt
- summary
- errorReport

## Wichtige Constraints

- aktive Signups pro Schicht dürfen `requiredVolunteers` nicht überschreiten
- Telefonnummer und E-Mail normalisiert speichern
- Signup-Verwaltungslinks nur gehasht speichern
- eine öffentliche Anmeldung reserviert den Platz sofort
- ein WorkRecord darf nicht gleichzeitig Sollstunden und Auszahlung sein
- WorkRecord beschreibt nur tatsächlich geleistete Arbeit und braucht ein Signup
- Auszahlungsbetrag wird serverseitig berechnet
- Dauer darf nicht negativ sein
- Saison muss zum Vereinsjahr gehören

## Beschlossene Status-Enums (D-026)

Technische Enum-Werte sind Englisch; UI-Labels sind Deutsch.

- `Season.status`: `DRAFT | ACTIVE | CLOSED | ARCHIVED`
- `Event.status`: `DRAFT | PUBLISHED | POSTPONED | CANCELLED | COMPLETED`
- `Shift.status`: `OPEN | CLOSED | CANCELLED`
- `Signup.status`: `ACTIVE | CANCELLED_BY_VOLUNTEER | CANCELLED_BY_ADMIN`
- `Signup.outcome`: `OPEN | ATTENDED | EXCUSED_CANCELLED | LATE_CANCELLED | NO_SHOW | SUBSTITUTE_ORGANIZED`
- `Payment.status`: `OPEN | APPROVED | PAID`

Belegungsanzeigen wie "voll", "noch 1 Platz frei" oder "offene Plätze" sind berechnete Anzeigen und keine gespeicherten Status.

## WorkRecord-Semantik (D-021, D-023)

Ein `WorkRecord` entsteht nur für tatsächlich geleistete Arbeit. Papiernachträge und Importe legen zuerst ein synthetisches Signup mit `source = ADMIN` bzw. `source = IMPORT` an. Ein Signup darf im Admin-Korrekturweg mehrere WorkRecords erhalten, damit ein Einsatz bei begründeten Härtefällen manuell aufgeteilt werden kann.
