"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { PublicOrganization } from "@/lib/organization";
import { submitVolunteerInterest, type VolunteerInterestArea } from "@/lib/volunteer-interest";

type Fields = {
  first_name: string;
  last_name: string;
  contact: string;
  message: string;
  area: VolunteerInterestArea;
  /** Honeypot: must stay empty. Bots that auto-fill every field trip it. */
  website: string;
};

const emptyFields: Fields = {
  first_name: "",
  last_name: "",
  contact: "",
  message: "",
  area: "EITHER",
  website: "",
};

/**
 * "Not sure yet? Apply anyway" interest form shown on the club recruitment
 * landing page for visitors who aren't ready to pick a shift directly.
 * Client component so it can hold form state and submit anonymously; the
 * surrounding page stays a server component for metadata + org fetch.
 */
export function VolunteerInterestForm({
  organization,
}: Readonly<{ organization: PublicOrganization }>) {
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  // Captured once, on first render, so the backend's min-fill-time anti-spam
  // check (>= 2s between this timestamp and submission) measures real time
  // spent on the form rather than resetting on every keystroke re-render.
  const [formStartedAt] = useState(() => new Date().toISOString());

  function updateField(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    try {
      await submitVolunteerInterest(organization.slug, {
        first_name: fields.first_name,
        last_name: fields.last_name,
        contact: fields.contact,
        message: fields.message.trim() ? fields.message.trim() : undefined,
        area: fields.area,
        website: fields.website,
        form_started_at: formStartedAt,
      });
      setStatus("success");
      setFields(emptyFields);
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p
        role="status"
        className="rounded-md border border-status-success/30 bg-status-success/10 p-4 font-semibold text-status-success"
      >
        Danke für dein Interesse! Wir melden uns bei dir.
      </p>
    );
  }

  return (
    <form aria-label="Interesse als Helfer:in" className="flex flex-col gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 font-medium">
          Vorname
          <input
            className="min-h-11 rounded border px-3 font-normal"
            name="first_name"
            type="text"
            value={fields.first_name}
            onChange={updateField}
            required
            autoComplete="given-name"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Nachname
          <input
            className="min-h-11 rounded border px-3 font-normal"
            name="last_name"
            type="text"
            value={fields.last_name}
            onChange={updateField}
            required
            autoComplete="family-name"
          />
        </label>
      </div>
      <div>
        <label className="flex flex-col gap-1 font-medium">
          Telefon oder E-Mail
          <input
            className="min-h-11 rounded border px-3 font-normal"
            name="contact"
            type="text"
            value={fields.contact}
            onChange={updateField}
            required
            placeholder="079 123 45 67 oder name@example.com"
          />
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          Wie wir dich am besten erreichen — beides funktioniert.
        </p>
      </div>
      <label className="flex flex-col gap-1 font-medium">
        Interessensbereich (optional)
        <select
          className="min-h-11 rounded border px-3 font-normal"
          name="area"
          value={fields.area}
          onChange={updateField}
        >
          <option value="EITHER">Weiss noch nicht</option>
          <option value="GRILL">Grill</option>
          <option value="KIOSK">Kiosk</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 font-medium">
        Nachricht (optional)
        <textarea
          className="min-h-24 rounded border px-3 py-2 font-normal"
          name="message"
          value={fields.message}
          onChange={updateField}
          maxLength={500}
        />
      </label>
      {/* Honeypot: hidden from sighted users and screen readers alike; only bots
          that blindly fill every field will populate it. */}
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
      >
        <label htmlFor="volunteer-interest-website">Website</label>
        <input
          id="volunteer-interest-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={fields.website}
          onChange={updateField}
        />
      </div>
      {status === "error" ? (
        <p role="alert" className="text-sm text-status-error">
          Deine Bewerbung konnte nicht gesendet werden. Bitte versuche es nochmals.
        </p>
      ) : null}
      <Button type="submit" disabled={status === "submitting"} className="sm:self-start sm:px-8">
        {status === "submitting" ? "Wird gesendet …" : "Interesse senden"}
      </Button>
    </form>
  );
}
