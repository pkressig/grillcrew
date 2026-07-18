"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { useAuth } from "@/components/auth-provider";
import { apiBaseUrl } from "@/lib/api";
import type { PublicOrganization } from "@/lib/organization";

export function LoginForm({ organization }: Readonly<{ organization: PublicOrganization }>) {
  const router = useRouter();
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noAccess, setNoAccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNoAccess(false);
    setIsSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(apiBaseUrl + "/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      if (!response.ok) {
        setError("E-Mail-Adresse oder Passwort ist ungültig.");
        return;
      }
      await auth.refresh();
      const session = (await response.json()) as { memberships: { organization_slug: string }[] };
      const firstMembership = session.memberships[0];
      if (firstMembership) {
        router.replace("/" + firstMembership.organization_slug + "/admin");
      } else {
        setNoAccess(true);
      }
    } catch {
      setError("Die Anmeldung ist derzeit nicht möglich. Bitte versuchen Sie es erneut.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard organization={organization} title="Anmelden">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1 font-medium">
          E-Mail-Adresse
          <input
            className="min-h-11 rounded border px-3 font-normal"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Passwort
          <input
            className="min-h-11 rounded border px-3 font-normal"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error ? (
          <p className="text-sm text-status-error" role="alert">
            {error}
          </p>
        ) : null}
        {noAccess ? (
          <p className="rounded border p-3 text-sm" role="status">
            Ihr Konto ist aktiv, hat aber keinen Organisationszugang.
          </p>
        ) : null}
        <button
          className="min-h-11 rounded bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Anmeldung läuft..." : "Anmelden"}
        </button>
      </form>
    </AuthCard>
  );
}
