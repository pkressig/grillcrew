"use client";

import { useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { telHref, whatsAppHref } from "@/lib/phone";
import { cn } from "@/lib/utils";

/** Free-text message that gets composed into a WhatsApp link on send, same
 * principle as the past-deadline ContactModal in signup-cancel-control.tsx
 * but with a helper-written message instead of a canned one. */
export function HelpContactForm({
  phone,
  label,
}: Readonly<{ phone: string; label: string | null }>) {
  const [message, setMessage] = useState("");
  const greeting = `Hallo${label ? " " + label : ""}`;
  const composedMessage = message.trim() ? `${greeting}, ${message.trim()}` : greeting;

  return (
    <div className="mt-4 space-y-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Deine Nachricht
        <textarea
          className="min-h-24 rounded border px-3 py-2 font-normal"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Schreibe hier deine Frage, dein Feedback oder deinen Verbesserungsvorschlag ..."
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <a
          className={cn(buttonVariants({ variant: "primary" }), "min-h-11")}
          href={whatsAppHref(phone, composedMessage)}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle aria-hidden="true" className="h-4 w-4" />
          Über WhatsApp senden
        </a>
        <a
          className={cn(buttonVariants({ variant: "secondary" }), "min-h-11")}
          href={telHref(phone)}
        >
          <Phone aria-hidden="true" className="h-4 w-4" />
          Anrufen
        </a>
      </div>
    </div>
  );
}
