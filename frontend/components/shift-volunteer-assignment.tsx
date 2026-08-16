"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { FamilyVolunteer } from "@/lib/families";
import type { Shift } from "@/lib/planning";

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

/** Manual admin assignment dropdown shown under a shift — lets staff pick a
 * specific volunteer from a curated list (e.g. only Grill or only Kiosk
 * helpers) instead of waiting for self-signup. Shared by the Grill and Kiosk
 * planning panels. */
export function ShiftVolunteerAssignment({
  shift,
  eventTitle,
  volunteers,
  timezone,
  busy,
  onAssign,
}: Readonly<{
  shift: Shift;
  eventTitle: string;
  volunteers: FamilyVolunteer[];
  timezone: string;
  busy: boolean;
  onAssign: (volunteerId: string) => Promise<boolean>;
}>) {
  const [volunteerId, setVolunteerId] = useState("");

  async function handleAssign() {
    if (!volunteerId) return;
    const assigned = await onAssign(volunteerId);
    if (assigned) setVolunteerId("");
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
      <label className="grid gap-1 text-xs font-medium" htmlFor={`assign-volunteer-${shift.id}`}>
        <span>Helfer zuweisen</span>
        <select
          className="min-h-11 rounded-md border bg-background px-3 py-1"
          id={`assign-volunteer-${shift.id}`}
          value={volunteerId}
          disabled={busy || volunteers.length === 0}
          aria-label={`Helfer für Einsatz ${formatDateTime(shift.starts_at, timezone)} für ${eventTitle} zuweisen`}
          onChange={(event) => setVolunteerId(event.target.value)}
        >
          <option value="">Bitte wählen</option>
          {volunteers.map((volunteer) => (
            <option key={volunteer.id} value={volunteer.id}>
              {volunteer.first_name} {volunteer.last_name}
            </option>
          ))}
        </select>
      </label>
      <Button
        className="min-h-11"
        size="sm"
        variant="secondary"
        disabled={busy || !volunteerId}
        onClick={() => void handleAssign()}
      >
        Zuweisen
      </Button>
    </div>
  );
}
