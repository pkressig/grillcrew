export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let inMemoryCsrfToken: string | null = null;

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = encodeURIComponent(name) + "=";
  const part = document.cookie.split("; ").find((cookie) => cookie.startsWith(prefix));
  if (!part) return null;
  return decodeURIComponent(part.slice(prefix.length));
}

export function csrfHeaders(): HeadersInit {
  const token = readCookie("gc_csrf") ?? inMemoryCsrfToken;
  if (!token) return {};
  return { "X-CSRF-Token": token };
}

export function clearCsrfToken(): void {
  inMemoryCsrfToken = null;
}

export async function fetchCsrfToken(): Promise<string> {
  const response = await fetch(apiBaseUrl + "/api/auth/csrf", { credentials: "include" });
  if (!response.ok) {
    clearCsrfToken();
    throw new Error("Der Sicherheitstoken konnte nicht geladen werden.");
  }
  const body = (await response.json()) as { csrf_token: string };
  if (!body.csrf_token) {
    clearCsrfToken();
    throw new Error("Der Sicherheitstoken konnte nicht geladen werden.");
  }
  inMemoryCsrfToken = body.csrf_token;
  return body.csrf_token;
}

export async function ensureCsrfToken(): Promise<string> {
  const token = readCookie("gc_csrf") ?? inMemoryCsrfToken;
  return token ?? fetchCsrfToken();
}
