"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { apiBaseUrl, csrfHeaders, ensureCsrfToken } from "@/lib/api";

export function LogoutButton() {
  const auth = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    try {
      await ensureCsrfToken();
      await fetch(apiBaseUrl + "/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders(),
      });
    } finally {
      auth.clear();
      router.replace("/login");
      setPending(false);
    }
  }
  return (
    <button
      className="min-h-11 rounded border px-4 font-medium"
      disabled={pending}
      onClick={() => void logout()}
      type="button"
    >
      {pending ? "Abmeldung läuft..." : "Abmelden"}
    </button>
  );
}
