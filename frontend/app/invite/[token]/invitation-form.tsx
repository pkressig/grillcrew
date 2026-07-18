"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { apiBaseUrl } from "@/lib/api";

export type InvitationPreview = {
  organization_name: string;
  role: string;
  password_required: boolean;
};

const roleLabels: Record<string, string> = {
  ADMIN: "Administration",
  KOORDINATION: "Koordination",
  KIOSK: "Kiosk",
  VORSTAND_LESEN: "Vorstand (Lesen)",
};

export function InvitationForm({
  token,
  preview,
}: Readonly<{ token: string; preview: InvitationPreview | null }>) {
  const [state, setState] = useState<"idle" | "pending" | "success" | "invalid">(
    preview ? "idle" : "invalid",
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("pending");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(apiBaseUrl + "/api/auth/accept-invitation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          display_name: preview?.password_required ? data.get("display_name") : null,
          password: preview?.password_required ? data.get("password") : null,
        }),
      });
      setState(response.ok ? "success" : "invalid");
    } catch {
      setState("invalid");
    }
  }
  return (
    <AuthCard title="Einladung annehmen">
      {state === "success" ? (
        <div role="status">
          <p>Die Einladung wurde angenommen.</p>
          <Link
            className="mt-4 inline-flex min-h-11 items-center rounded border px-4"
            href="/login"
          >
            Zur Anmeldung
          </Link>
        </div>
      ) : state === "invalid" || !preview ? (
        <p className="text-status-error" role="alert">
          Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet.
        </p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <p>
            Organisation: <strong>{preview.organization_name}</strong>
          </p>
          <p>
            Rolle: <strong>{roleLabels[preview.role] ?? preview.role}</strong>
          </p>
          {preview.password_required ? (
            <>
              <label className="flex flex-col gap-1 font-medium">
                Anzeigename
                <input
                  className="min-h-11 rounded border px-3 font-normal"
                  name="display_name"
                  autoComplete="name"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 font-medium">
                Passwort
                <input
                  className="min-h-11 rounded border px-3 font-normal"
                  name="password"
                  type="password"
                  minLength={10}
                  autoComplete="new-password"
                  required
                />
              </label>
            </>
          ) : null}
          <button
            className="min-h-11 rounded bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60"
            disabled={state === "pending"}
            type="submit"
          >
            Einladung annehmen
          </button>
        </form>
      )}
    </AuthCard>
  );
}
