"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  updateSignupAttendance,
  type AdminSignup,
  type PlanningEvent,
  type Shift,
  type SignupOutcome,
} from "@/lib/planning";
import { loadAdminPlanningData } from "@/lib/admin-planning-data";
import { loadFamilyChildren, type FamilyChild } from "@/lib/families";
import {
  classifyWorkRecord,
  loadWorkRecord,
  updateWorkRecordPayoutStatus,
  type CompensationType,
  type PayoutStatus,
  type WorkRecord,
} from "@/lib/work-records";

const outcomes: readonly SignupOutcome[] = [
  "OPEN",
  "ATTENDED",
  "EXCUSED_CANCELLED",
  "LATE_CANCELLED",
  "NO_SHOW",
  "SUBSTITUTE_ORGANIZED",
];

const outcomeLabels: Record<SignupOutcome, string> = {
  OPEN: "Noch offen",
  ATTENDED: "Anwesend",
  EXCUSED_CANCELLED: "Entschuldigt",
  LATE_CANCELLED: "Kurzfristig abgesagt",
  NO_SHOW: "Nicht erschienen",
  SUBSTITUTE_ORGANIZED: "Ersatz organisiert",
};

const outcomeVariants: Record<SignupOutcome, BadgeProps["variant"]> = {
  OPEN: "warning",
  ATTENDED: "success",
  EXCUSED_CANCELLED: "neutral",
  LATE_CANCELLED: "warning",
  NO_SHOW: "error",
  SUBSTITUTE_ORGANIZED: "success",
};

const compensationTypeLabels: Record<CompensationType, string> = {
  WORK_HOURS: "Sollstunden",
  VOLUNTARY: "Unentgeltlich",
  PAYOUT: "Auszahlung",
};

const payoutStatusLabels: Record<PayoutStatus, string> = {
  OPEN: "Offen",
  APPROVED: "Freigegeben",
  PAID: "Ausbezahlt",
};

const nextPayoutStatus: Record<PayoutStatus, PayoutStatus | null> = {
  OPEN: "APPROVED",
  APPROVED: "PAID",
  PAID: null,
};

type AttendanceRecord = {
  event: PlanningEvent;
  shift: Shift;
  signup: AdminSignup;
};

type Filter = "ALL" | SignupOutcome;

const control =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function AttendancePanel({
  org,
  timezone,
  currency = "CHF",
  role,
}: Readonly<{ org: string; timezone: string; currency?: string; role?: string }>) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [pendingNoShow, setPendingNoShow] = useState<AttendanceRecord | null>(null);
  const [children, setChildren] = useState<FamilyChild[]>([]);
  const requestId = useRef(0);
  const confirmationTrigger = useRef<HTMLElement | null>(null);
  const isAdmin = role === "ADMIN";

  useEffect(() => {
    let cancelled = false;
    loadFamilyChildren(org)
      .then((loaded) => {
        if (!cancelled) setChildren(loaded);
      })
      .catch(() => {
        // The child dropdown is a convenience; classification still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [org]);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setError(null);
    try {
      const { eventGroups } = await loadAdminPlanningData(org);
      if (currentRequest !== requestId.current) return;
      setRecords(
        eventGroups.flatMap(({ event, shifts }) =>
          shifts.flatMap((shift) => shift.signups.map((signup) => ({ event, shift, signup }))),
        ),
      );
    } catch (caught) {
      if (currentRequest !== requestId.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Anwesenheitsdaten konnten nicht geladen werden.",
      );
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    setLoading(true);
    setRecords([]);
    void refresh();
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  async function changeOutcome(record: AttendanceRecord, next: SignupOutcome) {
    setBusyId(record.signup.id);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateSignupAttendance(org, record.signup.id, next);
      setRecords((current) =>
        current.map((item) =>
          item.signup.id === record.signup.id ? { ...item, signup: updated } : item,
        ),
      );
      setSuccess(
        `Anwesenheit von ${record.signup.public_name} wurde auf „${outcomeLabels[next]}“ gesetzt.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Anwesenheit konnte nicht gespeichert werden.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function requestOutcomeChange(record: AttendanceRecord, next: SignupOutcome) {
    if (next === "NO_SHOW") {
      confirmationTrigger.current = document.activeElement as HTMLElement | null;
      setPendingNoShow(record);
      return;
    }
    void changeOutcome(record, next);
  }

  function closeNoShowConfirmation() {
    setPendingNoShow(null);
    window.requestAnimationFrame(() => confirmationTrigger.current?.focus());
  }

  const now = Date.now();
  const groups = useMemo(() => {
    const sorted = [...records].sort(
      (left, right) =>
        new Date(left.shift.starts_at).getTime() - new Date(right.shift.starts_at).getTime(),
    );
    return {
      action: sorted.filter(
        ({ shift, signup }) =>
          new Date(shift.ends_at).getTime() <= now && signup.outcome === "OPEN",
      ),
      upcoming: sorted.filter(({ shift }) => new Date(shift.ends_at).getTime() > now),
      completed: sorted
        .filter(
          ({ shift, signup }) =>
            new Date(shift.ends_at).getTime() <= now && signup.outcome !== "OPEN",
        )
        .reverse(),
    };
  }, [records, now]);

  const matches = (record: AttendanceRecord) => {
    const needle = search.trim().toLocaleLowerCase("de-CH");
    const text =
      `${record.signup.public_name} ${record.event.title} ${record.event.location}`.toLocaleLowerCase(
        "de-CH",
      );
    return (
      (!needle || text.includes(needle)) && (filter === "ALL" || record.signup.outcome === filter)
    );
  };

  const sections = [
    {
      id: "attendance-action",
      title: "Handlungsbedarf",
      description: "Vergangene Einsätze mit noch offener Anwesenheit.",
      records: groups.action.filter(matches),
      empty: "Keine offenen Anwesenheiten bei vergangenen Einsätzen.",
    },
    {
      id: "attendance-upcoming",
      title: "Bevorstehende Einsätze",
      description: "Anwesenheiten für noch nicht beendete Einsätze.",
      records: groups.upcoming.filter(matches),
      empty: "Keine bevorstehenden Eintragungen für diesen Filter.",
    },
    {
      id: "attendance-completed",
      title: "Abgeschlossene Einträge",
      description: "Erfasste Anwesenheiten vergangener Einsätze.",
      records: groups.completed.filter(matches),
      empty: "Keine abgeschlossenen Einträge für diesen Filter.",
    },
  ];

  return (
    <section className="grid gap-7" aria-labelledby="attendance-title">
      <PageHeader
        headingId="attendance-title"
        title="Anwesenheit"
        description="Anwesenheiten vergangener und bevorstehender Einsätze verwalten."
        action={
          <a
            className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`/${encodeURIComponent(org)}/admin/planning#attendance`}
          >
            Zur Planung
          </a>
        }
      />

      {error ? (
        <p
          className="rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="rounded-md border border-status-success/30 bg-status-success/5 p-3 text-sm text-status-success"
          role="status"
        >
          {success}
        </p>
      ) : null}

      {loading ? (
        <p role="status" aria-live="polite">
          Anwesenheiten werden geladen …
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3" aria-label="Anwesenheitsübersicht">
            {[
              ["Offener Handlungsbedarf", groups.action.length],
              ["Bevorstehende Eintragungen", groups.upcoming.length],
              ["Abgeschlossene Einträge", groups.completed.length],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-border/80 bg-card p-4 shadow-card"
              >
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          <Card className="border-border/80">
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium" htmlFor="attendance-search">
                Einträge suchen
                <input
                  className={control}
                  id="attendance-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, Anlass oder Ort"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium" htmlFor="attendance-filter">
                Status filtern
                <select
                  className={control}
                  id="attendance-filter"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as Filter)}
                >
                  <option value="ALL">Alle Status</option>
                  {outcomes.map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {outcomeLabels[outcome]}
                    </option>
                  ))}
                </select>
              </label>
            </CardBody>
          </Card>

          {records.length === 0 ? (
            <p className="rounded-md border border-border/80 p-5 text-sm text-muted-foreground">
              Es sind noch keine Eintragungen für Anwesenheiten vorhanden.
            </p>
          ) : (
            sections.map((section) => (
              <section key={section.id} aria-labelledby={section.id} className="grid gap-3">
                <div>
                  <h2 id={section.id} className="text-xl font-semibold">
                    {section.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                </div>
                {section.records.length === 0 ? (
                  <p className="rounded-md border border-border/70 p-4 text-sm text-muted-foreground">
                    {section.empty}
                  </p>
                ) : (
                  <AttendanceList
                    records={section.records}
                    timezone={timezone}
                    busyId={busyId}
                    onChange={requestOutcomeChange}
                    org={org}
                    currency={currency}
                    isAdmin={isAdmin}
                    familyChildren={children}
                  />
                )}
              </section>
            ))
          )}
        </>
      )}
      {pendingNoShow ? (
        <NoShowConfirmation
          name={pendingNoShow.signup.public_name}
          onCancel={closeNoShowConfirmation}
          onConfirm={() => {
            const record = pendingNoShow;
            closeNoShowConfirmation();
            void changeOutcome(record, "NO_SHOW");
          }}
        />
      ) : null}
    </section>
  );
}

function NoShowConfirmation({
  name,
  onCancel,
  onConfirm,
}: Readonly<{ name: string; onCancel: () => void; onConfirm: () => void }>) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "Tab") {
        const controls = dialog.current?.querySelectorAll<HTMLElement>("button");
        if (!controls?.length) return;
        const first = controls[0]!;
        const last = controls[controls.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4">
      <div
        ref={dialog}
        aria-describedby="no-show-description"
        aria-labelledby="no-show-title"
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg"
        role="dialog"
      >
        <h2 className="text-xl font-semibold" id="no-show-title">
          Als nicht erschienen markieren?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground" id="no-show-description">
          {name} wird als nicht erschienen erfasst. Bitte bestätigen Sie diese Änderung.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button autoFocus variant="destructive" onClick={onConfirm}>
            Nicht erschienen
          </Button>
        </div>
      </div>
    </div>
  );
}

function AttendanceList({
  records,
  timezone,
  busyId,
  onChange,
  org,
  currency,
  isAdmin,
  familyChildren,
}: Readonly<{
  records: AttendanceRecord[];
  timezone: string;
  busyId: string | null;
  onChange: (record: AttendanceRecord, outcome: SignupOutcome) => void;
  org: string;
  currency: string;
  isAdmin: boolean;
  familyChildren: FamilyChild[];
}>) {
  const outcomeControl = (record: AttendanceRecord, compact = false) => (
    <select
      className={`${control} ${compact ? "mt-2" : "min-w-52"}`}
      aria-label={`Anwesenheit von ${record.signup.public_name} für ${record.event.title}`}
      value={record.signup.outcome}
      disabled={busyId !== null}
      onChange={(event) => void onChange(record, event.target.value as SignupOutcome)}
    >
      {outcomes.map((outcome) => (
        <option key={outcome} value={outcome}>
          {outcomeLabels[outcome]}
        </option>
      ))}
    </select>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border/80">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium" scope="col">
                Person
              </th>
              <th className="px-4 py-3 font-medium" scope="col">
                Anlass und Einsatz
              </th>
              <th className="px-4 py-3 font-medium" scope="col">
                Status
              </th>
              <th className="px-4 py-3 font-medium" scope="col">
                Anwesenheit ändern
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {records.map((record) => (
              <tr key={record.signup.id}>
                <th className="px-4 py-3 font-medium" scope="row">
                  {record.signup.public_name}
                </th>
                <td className="px-4 py-3">
                  <span className="font-medium">{record.event.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(record.shift.starts_at, timezone)} · {record.event.location}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={outcomeVariants[record.signup.outcome]}>
                    {outcomeLabels[record.signup.outcome]}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {outcomeControl(record)}
                  {record.signup.outcome === "ATTENDED" ? (
                    <WorkRecordClassifier
                      org={org}
                      signup={record.signup}
                      currency={currency}
                      isAdmin={isAdmin}
                      familyChildren={familyChildren}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border/70 md:hidden" aria-label="Anwesenheitseinträge">
        {records.map((record) => (
          <li key={record.signup.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{record.signup.public_name}</p>
                <p className="text-sm">{record.event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(record.shift.starts_at, timezone)} · {record.event.location}
                </p>
              </div>
              <Badge variant={outcomeVariants[record.signup.outcome]}>
                {outcomeLabels[record.signup.outcome]}
              </Badge>
            </div>
            {outcomeControl(record, true)}
            {record.signup.outcome === "ATTENDED" ? (
              <WorkRecordClassifier
                org={org}
                signup={record.signup}
                currency={currency}
                isAdmin={isAdmin}
                familyChildren={familyChildren}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatAmount(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

function WorkRecordClassifier({
  org,
  signup,
  currency,
  isAdmin,
  familyChildren,
}: Readonly<{
  org: string;
  signup: AdminSignup;
  currency: string;
  isAdmin: boolean;
  familyChildren: FamilyChild[];
}>) {
  const [opened, setOpened] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [record, setRecord] = useState<WorkRecord | null>(null);
  const [compensationType, setCompensationType] = useState<CompensationType>("VOLUNTARY");
  const [familyMemberId, setFamilyMemberId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const existing = await loadWorkRecord(org, signup.id);
      setRecord(existing);
      setCompensationType(existing?.compensation_type ?? "VOLUNTARY");
      setFamilyMemberId(existing?.credited_family_member_id ?? "");
      setDurationMinutes(existing?.duration_minutes ? String(existing.duration_minutes) : "");
      setNote(existing?.note ?? "");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Zuordnung konnte nicht geladen werden.",
      );
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }

  async function save(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await classifyWorkRecord(org, signup.id, {
        compensation_type: compensationType,
        credited_family_member_id: familyMemberId || null,
        duration_minutes: compensationType === "PAYOUT" ? Number(durationMinutes) : null,
        note: note.trim() || null,
      });
      setRecord(updated);
      setSuccess("Zuordnung wurde gespeichert.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Zuordnung konnte nicht gespeichert werden.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function advancePayoutStatus(nextStatus: PayoutStatus, markSignatureReceived: boolean) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateWorkRecordPayoutStatus(org, signup.id, {
        payout_status: nextStatus,
        mark_signature_received: markSignatureReceived,
      });
      setRecord(updated);
      setSuccess("Auszahlungsstatus wurde aktualisiert.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Der Auszahlungsstatus konnte nicht gespeichert werden.",
      );
    } finally {
      setSaving(false);
    }
  }

  const locked = record?.payout_status === "APPROVED" || record?.payout_status === "PAID";
  const next = record?.payout_status ? nextPayoutStatus[record.payout_status] : null;

  return (
    <details
      className="mt-2 rounded-md border border-border/70 bg-muted/20 p-3"
      onToggle={(toggleEvent) => {
        const isOpen = toggleEvent.currentTarget.open;
        setOpened(isOpen);
        if (isOpen && !hasLoaded) void load();
      }}
    >
      <summary className="min-h-11 cursor-pointer text-xs font-medium">
        Nachträgliche Zuordnung
        {record ? ` – ${compensationTypeLabels[record.compensation_type]}` : ""}
      </summary>
      {!opened ? null : loading ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          Wird geladen …
        </p>
      ) : (
        <div className="mt-2 grid gap-2">
          {error ? (
            <p className="text-xs text-status-error" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-xs text-status-success" role="status">
              {success}
            </p>
          ) : null}
          <form
            className="grid gap-2 sm:grid-cols-2"
            onSubmit={(formEvent) => void save(formEvent)}
          >
            <label className="grid gap-1 text-xs font-medium">
              Vergütungsart
              <select
                className={control}
                aria-label={`Vergütungsart für ${signup.public_name}`}
                value={compensationType}
                disabled={saving || locked}
                onChange={(changeEvent) =>
                  setCompensationType(changeEvent.target.value as CompensationType)
                }
              >
                {(Object.keys(compensationTypeLabels) as CompensationType[]).map((type) => (
                  <option key={type} value={type}>
                    {compensationTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Zugeordnetes Kind
              <select
                className={control}
                aria-label={`Zugeordnetes Kind für ${signup.public_name}`}
                value={familyMemberId}
                disabled={saving || locked}
                onChange={(changeEvent) => setFamilyMemberId(changeEvent.target.value)}
              >
                <option value="">Nicht zugeordnet</option>
                {familyChildren.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.first_name} {child.last_name} ({child.family_display_name})
                  </option>
                ))}
              </select>
            </label>
            {compensationType === "PAYOUT" ? (
              <label className="grid gap-1 text-xs font-medium">
                Dauer (Minuten)
                <input
                  className={control}
                  type="number"
                  min={1}
                  required
                  value={durationMinutes}
                  disabled={saving || locked}
                  onChange={(changeEvent) => setDurationMinutes(changeEvent.target.value)}
                />
              </label>
            ) : null}
            <label className="grid gap-1 text-xs font-medium sm:col-span-2">
              Notiz
              <textarea
                className={control}
                value={note}
                disabled={saving || locked}
                onChange={(changeEvent) => setNote(changeEvent.target.value)}
              />
            </label>
            <Button className="sm:self-end" disabled={saving || locked} size="sm" type="submit">
              Zuordnung speichern
            </Button>
          </form>
          {record?.compensation_type === "PAYOUT" && record.payout_amount_minor !== null ? (
            <div className="rounded-md border border-border/70 bg-background p-2 text-xs">
              <p>
                Betrag: <strong>{formatAmount(record.payout_amount_minor, currency)}</strong> ·
                Status: {record.payout_status ? payoutStatusLabels[record.payout_status] : "–"}
              </p>
              {record.signature_received_at ? (
                <p className="mt-1 text-muted-foreground">
                  Unterschrift erhalten am{" "}
                  {new Date(record.signature_received_at).toLocaleDateString("de-CH")}.
                </p>
              ) : null}
              {isAdmin && next ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    disabled={saving}
                    size="sm"
                    type="button"
                    variant="secondary"
                    onClick={() => void advancePayoutStatus(next, false)}
                  >
                    {payoutStatusLabels[next]} setzen
                  </Button>
                  {next === "PAID" ? (
                    <Button
                      disabled={saving}
                      size="sm"
                      type="button"
                      variant="secondary"
                      onClick={() => void advancePayoutStatus(next, true)}
                    >
                      Ausbezahlt + Unterschrift erhalten
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </details>
  );
}
