"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { useAuth } from "@/components/auth-provider";
import { apiBaseUrl } from "@/lib/api";
import type { PublicOrganization } from "@/lib/organization";

export function ResetPasswordForm({
  token,
  organization,
}: Readonly<{ token: string; organization: PublicOrganization }>) {
  const router = useRouter();
  const auth = useAuth();
  const [state, setState] = useState<"idle" | "pending" | "invalid">("idle");
  const minimumLength = organization.settings.volunteer_password_min_length;

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
      if (!response.ok) {
        setState("invalid");
        return;
      }
      await auth.refresh();
      const body = (await response.json()) as {
        session: { memberships: { organization_slug: string }[] };
      };
      const firstMembership = body.session.memberships[0];
      router.replace(
        firstMembership ? `/${firstMembership.organization_slug}/admin` : `/${organization.slug}`,
      );
    } catch {
      setState("invalid");
    }
  }
  return (
    <AuthCard organization={organization} title="Passwort zurücksetzen">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1 font-medium">
          Neues Passwort
          <input
            className="min-h-11 rounded border px-3 font-normal"
            name="password"
            type="password"
            minLength={minimumLength}
            autoComplete="new-password"
            required
          />
        </label>
        <p className="text-sm text-muted-foreground">Mindestens {minimumLength} Zeichen.</p>
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
    </AuthCard>
  );
}
