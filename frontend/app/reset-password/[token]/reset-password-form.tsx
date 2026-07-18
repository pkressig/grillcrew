"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { apiBaseUrl } from "@/lib/api";

export function ResetPasswordForm({ token }: Readonly<{ token: string }>) {
  const [state, setState] = useState<"idle" | "pending" | "success" | "invalid">("idle");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("pending");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(apiBaseUrl + "/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: data.get("password") }),
      });
      setState(response.ok ? "success" : "invalid");
    } catch {
      setState("invalid");
    }
  }
  return (
    <AuthCard title="Passwort zurücksetzen">
      {state === "success" ? (
        <div role="status">
          <p>Ihr Passwort wurde geändert.</p>
          <Link
            className="mt-4 inline-flex min-h-11 items-center rounded border px-4"
            href="/login"
          >
            Zur Anmeldung
          </Link>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1 font-medium">
            Neues Passwort
            <input
              className="min-h-11 rounded border px-3 font-normal"
              name="password"
              type="password"
              minLength={10}
              autoComplete="new-password"
              required
            />
          </label>
          <p className="text-sm text-muted-foreground">Mindestens 10 Zeichen.</p>
          {state === "invalid" ? (
            <p className="text-sm text-status-error" role="alert">
              Der Link ist ungültig oder abgelaufen. Fordern Sie einen neuen Link an.
            </p>
          ) : null}
          <button
            className="min-h-11 rounded bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60"
            disabled={state === "pending"}
            type="submit"
          >
            Passwort speichern
          </button>
        </form>
      )}
    </AuthCard>
  );
}
