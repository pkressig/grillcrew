export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = encodeURIComponent(name) + "=";
  const part = document.cookie.split("; ").find((cookie) => cookie.startsWith(prefix));
  if (!part) return null;
  return decodeURIComponent(part.slice(prefix.length));
}

export function csrfHeaders(): HeadersInit {
  const token = readCookie("gc_csrf");
  if (!token) return {};
  return { "X-CSRF-Token": token };
}
