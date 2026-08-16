"use client";

import { useState, type FormEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { telHref, whatsAppHref } from "@/lib/phone";
import type { PublicOrganization } from "@/lib/organization";
import {
  cancelSignup,
  type VolunteerProfile,
  type VolunteerSignupSummary,
} from "@/lib/volunteer-profile";

type CancelableSignup = Pick<VolunteerSignupSummary, "id" | "event_title" | "can_cancel">;

/** Small red "Absagen" trigger shown next to a signup's status badge. Within
 * the self-cancel deadline it opens the reason modal and cancels directly;
 * once the deadline has passed, direct cancellation is no longer offered, so
 * it opens a contact modal pointing to the organization's coordination
 * contact instead. */
export function SignupCancelControl({
  entry,
  shiftLabel,
  organization,
  onCancelled,
}: Readonly<{
  entry: CancelableSignup;
  shiftLabel: string;
  organization: PublicOrganization;
  onCancelled: (profile: VolunteerProfile) => void;
}>) {
  const [open, setOpen] = useState<"reason" | "contact" | null>(null);

  return (
    <>
      <button
        type="button"
        aria-label={`Einsatz "${entry.event_title}" absagen`}
        className="min-h-8 shrink-0 rounded border border-status-error px-2 py-0.5 text-xs font-semibold text-status-error hover:bg-status-error/10"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(entry.can_cancel ? "reason" : "contact");
        }}
      >
        Absagen
      </button>
      {open === "reason" ? (
        <ReasonModal
          entry={entry}
          shiftLabel={shiftLabel}
          onClose={() => setOpen(null)}
          onCancelled={(profile) => {
            setOpen(null);
            onCancelled(profile);
          }}
        />
      ) : null}
      {open === "contact" ? (
        <ContactModal
          entry={entry}
          shiftLabel={shiftLabel}
          organization={organization}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function ReasonModal({
  entry,
  shiftLabel,
  onClose,
  onCancelled,
}: Readonly<{
  entry: CancelableSignup;
  shiftLabel: string;
  onClose: () => void;
  onCancelled: (profile: VolunteerProfile) => void;
}>) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmCancel(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await cancelSignup(entry.id, { reason: reason.trim() || null });
      onCancelled(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die Abmeldung ist fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Einsatz abmelden"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="w-full max-w-md rounded-lg bg-background p-4" onSubmit={confirmCancel}>
        <h2 className="text-xl font-bold">Einsatz abmelden</h2>
        <p className="mt-2 text-sm">
          {entry.event_title} · {shiftLabel}
        </p>
        <label className="mt-3 flex flex-col gap-1 text-sm font-medium">
          Grund (optional)
          <textarea
            className="min-h-11 rounded border px-3 font-normal"
            maxLength={100}
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-status-error">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button type="submit" variant="destructive" disabled={busy} className="flex-1">
            {busy ? "Wird abgemeldet …" : "Abmelden bestätigen"}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
}

function ContactModal({
  entry,
  shiftLabel,
  organization,
  onClose,
}: Readonly<{
  entry: CancelableSignup;
  shiftLabel: string;
  organization: PublicOrganization;
  onClose: () => void;
}>) {
  const label = organization.settings.coordination_contact_label;
  const phone = organization.settings.coordination_contact_phone;
  const message = `Hallo${label ? " " + label : ""}, ich muss meinen Einsatz "${entry.event_title}" am ${shiftLabel} leider kurzfristig absagen.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Kurzfristige Abmeldung"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-lg bg-background p-4">
        <h2 className="text-xl font-bold">Direkte Abmeldung nicht mehr möglich</h2>
        <p className="mt-2 text-sm">
          {entry.event_title} · {shiftLabel}
        </p>
        <p className="mt-3 text-sm">
          Die Abmeldefrist für diesen Einsatz ist bereits abgelaufen. Bitte melde dich für eine
          kurzfristige Absage direkt{label ? ` bei ${label}` : ""}.
        </p>
        {phone ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <a
              className={buttonVariants({ variant: "primary" })}
              href={whatsAppHref(phone, message)}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp senden
            </a>
            <a className={buttonVariants({ variant: "secondary" })} href={telHref(phone)}>
              {label ?? "Kontakt"} anrufen
            </a>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Bitte kontaktiere die Koordination deiner Organisation.
          </p>
        )}
        <Button type="button" variant="secondary" className="mt-4" onClick={onClose}>
          Schliessen
        </Button>
      </div>
    </div>
  );
}
