"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { AuthCard } from "@/components/auth-card";
import { SignupCancelControl } from "@/components/signup-cancel-control";
import { SignupDetailCard } from "@/components/signup-detail-card";
import { formatShiftHeading } from "@/lib/shift-format";
import { getLastOrganizationSlug } from "@/lib/organization";
import type { ManagedSignup } from "@/lib/public-plan";
import {
  fetchOwnSignupDetail,
  fetchVolunteerProfile,
  type VolunteerProfile,
} from "@/lib/volunteer-profile";

const CANCEL_TRIGGER_CLASSNAME =
  "min-h-11 w-full rounded-sm border border-status-error bg-status-error px-4 font-medium text-white transition-colors hover:opacity-90 sm:w-auto";

export function OwnSignupDetail({ signupId }: Readonly<{ signupId: string }>) {
  const auth = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [signup, setSignup] = useState<ManagedSignup | null>(null);
  const [notFound, setNotFound] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [profileResult, signupResult] = await Promise.all([
        fetchVolunteerProfile(),
        fetchOwnSignupDetail(signupId),
      ]);
      setProfile(profileResult);
      setSignup(signupResult);
    } catch {
      setNotFound(true);
    }
  }, [signupId]);

  useEffect(() => {
    if (auth.isAuthenticated) void reload();
  }, [auth.isAuthenticated, reload]);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/profile");
    }
  }

  if (auth.isLoading) return <main className="p-6">Wird geladen …</main>;
  if (!auth.isAuthenticated) {
    // Mirrors /profile's own guard: no organization slug is known here
    // either, so route back to whichever club's hub this browser last
    // visited rather than a generic platform page.
    const lastOrganizationSlug = getLastOrganizationSlug();
    const loginHref = lastOrganizationSlug ? `/${encodeURIComponent(lastOrganizationSlug)}` : "/";
    return (
      <AuthCard title="Anmeldung erforderlich" back={{ label: "Zurück", onClick: goBack }}>
        <p>Bitte melde dich an, um deine Eintragung zu sehen.</p>
        <Link className="mt-3 inline-block underline" href={loginHref}>
          Anmelden
        </Link>
      </AuthCard>
    );
  }
  if (notFound)
    return (
      <AuthCard title="Nicht gefunden" back={{ label: "Zurück", onClick: goBack }}>
        <p>Diese Eintragung konnte nicht gefunden werden.</p>
      </AuthCard>
    );
  if (!profile || !signup) return <main className="p-6">Eintragung wird geladen …</main>;

  const cancelled = signup.signup_status !== "ACTIVE";
  return (
    <main className="min-h-dvh bg-muted/60 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <button
          type="button"
          onClick={goBack}
          className="-ms-2 mb-5 flex min-h-11 w-fit items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Zurück
        </button>
        <SignupDetailCard
          signup={signup}
          timezone={profile.organization.timezone}
          cancelSection={
            <section aria-labelledby="cancellation-heading" className="mt-6">
              <h2 id="cancellation-heading" className="text-lg font-semibold">
                Absage
              </h2>
              {cancelled ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Für diese Eintragung ist keine weitere Aktion nötig.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {signup.can_cancel
                      ? "Falls du verhindert bist, kannst du deine Eintragung hier endgültig absagen."
                      : signup.cancellation_guidance}
                  </p>
                  <div className="mt-3">
                    <SignupCancelControl
                      entry={{
                        id: signupId,
                        event_title: signup.event_title,
                        can_cancel: signup.can_cancel,
                      }}
                      shiftLabel={formatShiftHeading(
                        signup.shift_starts_at,
                        signup.shift_ends_at,
                        profile.organization.timezone,
                      )}
                      organization={profile.organization}
                      onCancelled={() => void reload()}
                      triggerClassName={CANCEL_TRIGGER_CLASSNAME}
                    />
                  </div>
                </>
              )}
            </section>
          }
        />
      </div>
    </main>
  );
}
