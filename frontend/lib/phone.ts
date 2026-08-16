function digitsWithPlus(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

/** Normalizes a Swiss-style local number ("079 513 44 33") or an already
 * international one into the E.164-ish form tel:/wa.me links expect. */
export function normalizePhoneForLinks(raw: string): string {
  const cleaned = digitsWithPlus(raw);
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith("0")) return `+41${cleaned.slice(1)}`;
  return cleaned;
}

export function telHref(phone: string): string {
  return `tel:${normalizePhoneForLinks(phone)}`;
}

export function whatsAppHref(phone: string, message?: string): string {
  const digits = normalizePhoneForLinks(phone).replace("+", "");
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}
