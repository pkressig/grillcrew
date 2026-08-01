"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  createCrewSizeRule,
  createHomeVenue,
  loadCrewSizeRules,
  loadHomeVenues,
  loadOrganizationSettings,
  reorderCrewSizeRules,
  updateCrewSizeRule,
  updateHomeVenue,
  updateOrganizationSettings,
  type CrewSizeRule,
  type HomeVenue,
  type MenuType,
  type OrganizationSettings,
} from "@/lib/settings";
import { cn } from "@/lib/utils";
import {
  createCoordinationTime,
  loadCoordinationTime,
  updateCoordinationTime,
  updateCoordinationTimeStatus,
  type CoordinationTimeRecord,
} from "@/lib/coordination-time";

const control = "min-h-11 w-full rounded-md border bg-background px-3 py-2";
const menuTypeLabels: Record<MenuType, string> = {
  FRIES_NUGGETS: "Pommes/Chicken Nuggets",
  FRIES_NUGGETS_BURGER: "Pommes/Chicken Nuggets + Burger",
};

export function SettingsPanel({ org }: Readonly<{ org: string }>) {
  return (
    <section className="grid gap-7" aria-labelledby="settings-heading">
      <PageHeader
        headingId="settings-heading"
        title="Einstellungen"
        description="Heimplätze, Crew-Regeln und Organisationseinstellungen verwalten."
      />
      <OrganizationSettingsSection org={org} />
      <CoordinationTimeSection org={org} />
      <HomeVenuesSection org={org} />
      <CrewSizeRulesSection org={org} />
    </section>
  );
}

const payoutLabels = { OPEN: "Offen", APPROVED: "Freigegeben", PAID: "Ausbezahlt" } as const;

function CoordinationTimeSection({ org }: Readonly<{ org: string }>) {
  const [records, setRecords] = useState<CoordinationTimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setRecords(await loadCoordinationTime(org));
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Koordinationszeiten konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);
  useEffect(() => void refresh(), [refresh]);

  async function save(event: FormEvent<HTMLFormElement>, record?: CoordinationTimeRecord) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      work_date: String(data.get("work_date")),
      duration_minutes: Number(data.get("duration_minutes")),
      hourly_rate_minor: Number(data.get("hourly_rate_minor")),
      note: String(data.get("note") ?? "").trim() || null,
    };
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (record) await updateCoordinationTime(org, record.id, payload);
      else {
        await createCoordinationTime(org, payload);
        form.reset();
      }
      setSuccess(
        record ? "Koordinationszeit wurde aktualisiert." : "Koordinationszeit wurde erfasst.",
      );
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Koordinationszeit konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function advance(record: CoordinationTimeRecord, form: HTMLFormElement) {
    const next = record.payout_status === "OPEN" ? "APPROVED" : "PAID";
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await updateCoordinationTimeStatus(org, record.id, {
        payout_status: next,
        mark_signature_received: Boolean(data.get("signature_received")),
        signature_note: String(data.get("signature_note") ?? "").trim() || null,
      });
      setSuccess("Auszahlungsstatus wurde aktualisiert.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Der Status konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  const fields = (record?: CoordinationTimeRecord) => (
    <>
      <label className="grid gap-1" htmlFor={`coord-date-${record?.id ?? "new"}`}>
        Datum
        <input
          className={control}
          id={`coord-date-${record?.id ?? "new"}`}
          name="work_date"
          type="date"
          required
          disabled={busy || (record && record.payout_status !== "OPEN")}
          defaultValue={record?.work_date}
        />
      </label>
      <label className="grid gap-1" htmlFor={`coord-duration-${record?.id ?? "new"}`}>
        Dauer (Minuten)
        <input
          className={control}
          id={`coord-duration-${record?.id ?? "new"}`}
          name="duration_minutes"
          type="number"
          min={1}
          max={1440}
          required
          disabled={busy || (record && record.payout_status !== "OPEN")}
          defaultValue={record?.duration_minutes}
        />
      </label>
      <label className="grid gap-1" htmlFor={`coord-rate-${record?.id ?? "new"}`}>
        Eigener Stundensatz (Rappen)
        <input
          className={control}
          id={`coord-rate-${record?.id ?? "new"}`}
          name="hourly_rate_minor"
          type="number"
          min={0}
          required
          disabled={busy || (record && record.payout_status !== "OPEN")}
          defaultValue={record?.hourly_rate_minor}
        />
      </label>
      <label className="grid gap-1 sm:col-span-3" htmlFor={`coord-note-${record?.id ?? "new"}`}>
        Notiz
        <textarea
          className={control}
          id={`coord-note-${record?.id ?? "new"}`}
          name="note"
          maxLength={2000}
          disabled={busy || (record && record.payout_status !== "OPEN")}
          defaultValue={record?.note ?? ""}
        />
      </label>
    </>
  );

  return (
    <Card className="border-border/80" aria-labelledby="coordination-time-heading">
      <CardBody className="grid gap-4">
        <div>
          <h2 id="coordination-time-heading" className="text-xl font-semibold">
            Koordinationszeit
          </h2>
          <p className="text-sm text-muted-foreground">
            Private ADMIN-Erfassung, getrennt von Helfereinsätzen und Anmeldungen. Beträge werden
            kaufmännisch auf Rappen gerundet; der eingegebene Satz wird gespeichert und ab Freigabe
            gesperrt.
          </p>
        </div>
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(event) => void save(event)}>
          {fields()}
          <Button type="submit" disabled={busy}>
            {busy ? "Wird gespeichert …" : "Koordinationszeit erfassen"}
          </Button>
        </form>
        {loading ? (
          <p role="status">Koordinationszeiten werden geladen …</p>
        ) : records.length === 0 ? (
          <p>Noch keine Koordinationszeiten erfasst.</p>
        ) : (
          <ul className="grid gap-3" aria-label="Koordinationszeiten">
            {records.map((record) => (
              <li key={record.id} className="rounded-md border p-3">
                <form
                  className="grid gap-3 sm:grid-cols-3"
                  onSubmit={(event) => void save(event, record)}
                >
                  {fields(record)}
                  <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
                    <Badge variant={record.payout_status === "PAID" ? "success" : "neutral"}>
                      {payoutLabels[record.payout_status]}
                    </Badge>
                    <span>{(record.payout_amount_minor / 100).toFixed(2)} CHF</span>
                    {record.payout_status === "OPEN" ? (
                      <Button type="submit" variant="secondary" disabled={busy}>
                        Änderungen speichern
                      </Button>
                    ) : null}
                  </div>
                </form>
                <form
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void advance(record, event.currentTarget);
                  }}
                >
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      name="signature_received"
                      disabled={busy || Boolean(record.signature_received_at)}
                      defaultChecked={Boolean(record.signature_received_at)}
                    />
                    Unterschrift erhalten
                  </label>
                  <label className="grid gap-1" htmlFor={`signature-note-${record.id}`}>
                    Unterschriftsnotiz
                    <input
                      className={control}
                      id={`signature-note-${record.id}`}
                      name="signature_note"
                      maxLength={2000}
                      defaultValue={record.signature_note ?? ""}
                      disabled={busy}
                    />
                  </label>
                  {record.payout_status !== "PAID" ? (
                    <Button type="submit" disabled={busy}>
                      {record.payout_status === "OPEN" ? "Freigeben" : "Als ausbezahlt markieren"}
                    </Button>
                  ) : null}
                </form>
              </li>
            ))}
          </ul>
        )}
        <FeedbackMessages error={error} success={success} />
      </CardBody>
    </Card>
  );
}

function FeedbackMessages({
  error,
  success,
}: Readonly<{ error: string | null; success: string | null }>) {
  return (
    <>
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
    </>
  );
}

function OrganizationSettingsSection({ org }: Readonly<{ org: string }>) {
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setSettings(await loadOrganizationSettings(org));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Organisationseinstellungen konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);
  useEffect(() => void refresh(), [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      setSettings(
        await updateOrganizationSettings(org, {
          payout_rate_minor_per_hour: Number(data.get("payout_rate_minor_per_hour")),
          signup_rate_limit_per_contact: Number(data.get("signup_rate_limit_per_contact")),
          signup_rate_limit_window_minutes: Number(data.get("signup_rate_limit_window_minutes")),
          coordination_contact_label: String(data.get("coordination_contact_label") ?? "") || null,
        }),
      );
      setSuccess("Organisationseinstellungen wurden gespeichert.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Organisationseinstellungen konnten nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/80" aria-labelledby="org-settings-heading">
      <CardBody className="grid gap-4">
        <h2 id="org-settings-heading" className="text-xl font-semibold">
          Organisationseinstellungen
        </h2>
        {loading ? (
          <p role="status">Einstellungen werden geladen …</p>
        ) : settings ? (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            <label className="grid gap-1" htmlFor="payout-rate">
              Auszahlungssatz (Rappen/Stunde)
              <input
                className={control}
                id="payout-rate"
                name="payout_rate_minor_per_hour"
                type="number"
                min={0}
                required
                defaultValue={settings.payout_rate_minor_per_hour}
                disabled={busy}
              />
            </label>
            <label className="grid gap-1" htmlFor="coordination-contact-label">
              Koordinationskontakt (Text)
              <input
                className={control}
                id="coordination-contact-label"
                name="coordination_contact_label"
                maxLength={100}
                defaultValue={settings.coordination_contact_label ?? ""}
                disabled={busy}
              />
            </label>
            <label className="grid gap-1" htmlFor="rate-limit-per-contact">
              Anmeldelimit pro Kontakt
              <input
                className={control}
                id="rate-limit-per-contact"
                name="signup_rate_limit_per_contact"
                type="number"
                min={1}
                required
                defaultValue={settings.signup_rate_limit_per_contact}
                disabled={busy}
              />
            </label>
            <label className="grid gap-1" htmlFor="rate-limit-window">
              Anmeldelimit-Zeitfenster (Minuten)
              <input
                className={control}
                id="rate-limit-window"
                name="signup_rate_limit_window_minutes"
                type="number"
                min={1}
                required
                defaultValue={settings.signup_rate_limit_window_minutes}
                disabled={busy}
              />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Wird gespeichert …" : "Speichern"}
              </Button>
            </div>
          </form>
        ) : null}
        <FeedbackMessages error={error} success={success} />
      </CardBody>
    </Card>
  );
}

function HomeVenuesSection({ org }: Readonly<{ org: string }>) {
  const [venues, setVenues] = useState<HomeVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setVenues(await loadHomeVenues(org));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Heimplätze konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);
  useEffect(() => void refresh(), [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) {
      setError("Der Name des Heimplatzes ist erforderlich.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await createHomeVenue(org, { name });
      form.reset();
      setSuccess("Heimplatz wurde gespeichert.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Der Heimplatz konnte nicht erstellt werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(venue: HomeVenue) {
    if (venue.is_active && !window.confirm(`"${venue.name}" als Heimplatz deaktivieren?`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await updateHomeVenue(org, venue.id, { is_active: !venue.is_active });
      setSuccess(venue.is_active ? "Heimplatz wurde deaktiviert." : "Heimplatz wurde aktiviert.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Der Heimplatz konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/80" aria-labelledby="home-venues-heading">
      <CardBody className="grid gap-4">
        <h2 id="home-venues-heading" className="text-xl font-semibold">
          Heimplätze
        </h2>
        <p className="text-sm text-muted-foreground">
          Nur Spiele an aktiven Heimplätzen gelten beim Spielplan-Import als Grill-/Kioskeinsatz.
        </p>
        {loading ? (
          <p role="status">Heimplätze werden geladen …</p>
        ) : venues.length === 0 ? (
          <p>Noch keine Heimplätze vorhanden.</p>
        ) : (
          <ul className="grid gap-2" aria-label="Heimplätze">
            {venues.map((venue) => (
              <li key={venue.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <span>{venue.name}</span>
                    <Badge variant={venue.is_active ? "success" : "neutral"}>
                      {venue.is_active ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void toggleActive(venue)}
                  >
                    {venue.is_active ? "Deaktivieren" : "Aktivieren"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={submit}>
          <label className="grid gap-1" htmlFor="home-venue-name">
            Neuer Heimplatz
            <input
              className={control}
              id="home-venue-name"
              name="name"
              required
              maxLength={200}
              placeholder="z. B. Cazis / St. Martin"
              disabled={busy}
            />
          </label>
          <Button className="self-end" type="submit" disabled={busy}>
            {busy ? "Wird gespeichert …" : "Hinzufügen"}
          </Button>
        </form>
        <FeedbackMessages error={error} success={success} />
      </CardBody>
    </Card>
  );
}

function CrewSizeRulesSection({ org }: Readonly<{ org: string }>) {
  const [rules, setRules] = useState<CrewSizeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setRules(await loadCrewSizeRules(org));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Crew-Regeln konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [org]);
  useEffect(() => void refresh(), [refresh]);

  const orderedRules = rules.filter((rule) => rule.pattern !== null);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const pattern = String(data.get("pattern") ?? "").trim();
    if (!pattern) {
      setError("Das Team-Muster ist erforderlich.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await createCrewSizeRule(org, {
        pattern,
        menu_type: data.get("menu_type") as MenuType,
        required_griller_count: Number(data.get("required_griller_count")),
        min_games_per_shift: Number(data.get("min_games_per_shift")),
      });
      form.reset();
      setSuccess("Crew-Regel wurde erstellt.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Die Crew-Regel konnte nicht erstellt werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(rule: CrewSizeRule, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const patternValue = String(data.get("pattern") ?? "").trim();
      await updateCrewSizeRule(org, rule.id, {
        pattern: rule.pattern === null ? null : patternValue,
        menu_type: data.get("menu_type") as MenuType,
        required_griller_count: Number(data.get("required_griller_count")),
        min_games_per_shift: Number(data.get("min_games_per_shift")),
      });
      setSuccess("Crew-Regel wurde gespeichert.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Crew-Regel konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(rule: CrewSizeRule) {
    if (rule.is_active && !window.confirm("Diese Crew-Regel deaktivieren?")) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await updateCrewSizeRule(org, rule.id, { is_active: !rule.is_active });
      setSuccess(rule.is_active ? "Crew-Regel wurde deaktiviert." : "Crew-Regel wurde aktiviert.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Crew-Regel konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function move(rule: CrewSizeRule, direction: -1 | 1) {
    const index = orderedRules.findIndex((item) => item.id === rule.id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= orderedRules.length) return;
    const reordered = [...orderedRules];
    const moved = reordered[index]!;
    reordered[index] = reordered[targetIndex]!;
    reordered[targetIndex] = moved;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await reorderCrewSizeRules(
        org,
        reordered.map((item) => item.id),
      );
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Reihenfolge konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/80" aria-labelledby="crew-size-rules-heading">
      <CardBody className="grid gap-4">
        <h2 id="crew-size-rules-heading" className="text-xl font-semibold">
          Crew-Regeln
        </h2>
        <p className="text-sm text-muted-foreground">
          Regeln schlagen Menü und Anzahl Griller anhand des Team-Namens vor. Der Vorschlag bleibt
          beim Anlegen einer Schicht immer änderbar. Die Standardregel greift zuletzt, wenn keine
          andere Regel passt.
        </p>
        {loading ? (
          <p role="status">Crew-Regeln werden geladen …</p>
        ) : (
          <ul className="grid gap-2" aria-label="Crew-Regeln">
            {[...orderedRules, ...rules.filter((rule) => rule.pattern === null)].map((rule) => {
              const isCatchall = rule.pattern === null;
              const orderIndex = orderedRules.findIndex((item) => item.id === rule.id);
              return (
                <li key={rule.id}>
                  <div
                    className={cn(
                      "grid gap-3 rounded-md border p-3",
                      isCatchall && "border-dashed bg-muted/40",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {isCatchall
                          ? "Standardregel (alle übrigen Spiele)"
                          : `Muster: ${rule.pattern}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant={rule.is_active ? "success" : "neutral"}>
                          {rule.is_active ? "Aktiv" : "Inaktiv"}
                        </Badge>
                        {isCatchall ? null : (
                          <>
                            <Button
                              aria-label="Regel nach oben verschieben"
                              disabled={busy || orderIndex <= 0}
                              size="sm"
                              variant="secondary"
                              onClick={() => void move(rule, -1)}
                            >
                              Hoch
                            </Button>
                            <Button
                              aria-label="Regel nach unten verschieben"
                              disabled={busy || orderIndex >= orderedRules.length - 1}
                              size="sm"
                              variant="secondary"
                              onClick={() => void move(rule, 1)}
                            >
                              Runter
                            </Button>
                            <Button
                              disabled={busy}
                              size="sm"
                              variant="secondary"
                              onClick={() => void toggleActive(rule)}
                            >
                              {rule.is_active ? "Deaktivieren" : "Aktivieren"}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <form
                      className="grid gap-3 sm:grid-cols-3"
                      onSubmit={(event) => void submitEdit(rule, event)}
                    >
                      {isCatchall ? null : (
                        <label
                          className="grid gap-1 text-sm sm:col-span-3"
                          htmlFor={`pattern-${rule.id}`}
                        >
                          Team-Muster
                          <input
                            className={control}
                            defaultValue={rule.pattern ?? ""}
                            disabled={busy}
                            id={`pattern-${rule.id}`}
                            maxLength={200}
                            name="pattern"
                            required
                          />
                        </label>
                      )}
                      <label className="grid gap-1 text-sm" htmlFor={`menu-type-${rule.id}`}>
                        Menü
                        <select
                          className={control}
                          defaultValue={rule.menu_type}
                          disabled={busy}
                          id={`menu-type-${rule.id}`}
                          name="menu_type"
                        >
                          {Object.entries(menuTypeLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm" htmlFor={`griller-count-${rule.id}`}>
                        Benötigte Griller
                        <input
                          className={control}
                          defaultValue={rule.required_griller_count}
                          disabled={busy}
                          id={`griller-count-${rule.id}`}
                          min={1}
                          name="required_griller_count"
                          required
                          type="number"
                        />
                      </label>
                      <label className="grid gap-1 text-sm" htmlFor={`min-games-${rule.id}`}>
                        Mind. Spiele je Schicht
                        <input
                          className={control}
                          defaultValue={rule.min_games_per_shift}
                          disabled={busy}
                          id={`min-games-${rule.id}`}
                          min={1}
                          name="min_games_per_shift"
                          required
                          type="number"
                        />
                      </label>
                      <div className="sm:col-span-3">
                        <Button disabled={busy} size="sm" type="submit">
                          Speichern
                        </Button>
                      </div>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={submitCreate}>
          <label className="grid gap-1 text-sm sm:col-span-3" htmlFor="new-rule-pattern">
            Team-Muster (z. B. &quot;Junioren&quot;)
            <input
              className={control}
              disabled={busy}
              id="new-rule-pattern"
              maxLength={200}
              name="pattern"
              required
            />
          </label>
          <label className="grid gap-1 text-sm" htmlFor="new-rule-menu-type">
            Menü
            <select
              className={control}
              defaultValue="FRIES_NUGGETS"
              disabled={busy}
              id="new-rule-menu-type"
              name="menu_type"
            >
              {Object.entries(menuTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm" htmlFor="new-rule-griller-count">
            Benötigte Griller
            <input
              className={control}
              defaultValue={1}
              disabled={busy}
              id="new-rule-griller-count"
              min={1}
              name="required_griller_count"
              required
              type="number"
            />
          </label>
          <label className="grid gap-1 text-sm" htmlFor="new-rule-min-games">
            Mind. Spiele je Schicht
            <input
              className={control}
              defaultValue={1}
              disabled={busy}
              id="new-rule-min-games"
              min={1}
              name="min_games_per_shift"
              required
              type="number"
            />
          </label>
          <div className="sm:col-span-3">
            <Button disabled={busy} type="submit">
              {busy ? "Wird gespeichert …" : "Regel hinzufügen"}
            </Button>
          </div>
        </form>
        <FeedbackMessages error={error} success={success} />
      </CardBody>
    </Card>
  );
}
