"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useOrganization } from "@/components/organization-provider";
import { SignupDetailCard } from "@/components/signup-detail-card";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cancelManagedSignup, fetchManagedSignup, type ManagedSignup } from "@/lib/public-plan";

export function ManagedSignupPage({ token }: Readonly<{ token: string }>) {
  const organization = useOrganization();
  const [signup, setSignup] = useState<ManagedSignup | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchManagedSignup(organization.slug, token)
      .then((result) => active && setSignup(result))
      .catch(() => active && setInvalid(true));
    return () => {
      active = false;
    };
  }, [organization.slug, token]);

  async function cancelSignup() {
    if (
      !window.confirm(
        "Möchtest du deine Eintragung wirklich absagen? Diese Aktion kann nicht rückgängig gemacht werden.",
      )
    )
      return;
    setCancelling(true);
    setCancelError(false);
    try {
      setSignup(await cancelManagedSignup(organization.slug, token));
    } catch {
      setCancelError(true);
    } finally {
      setCancelling(false);
    }
  }

  if (invalid)
    return (
      <Shell>
        <Card>
          <CardBody className="space-y-5 p-5 sm:p-7">
            <PageHeader
              title="Link nicht gültig"
              description="Diese Eintragung konnte nicht gefunden werden."
            />
            <p className="text-sm text-muted-foreground">
              Bitte überprüfe den persönlichen Web-Link oder kontaktiere die Koordination deiner
              Organisation.
            </p>
          </CardBody>
        </Card>
      </Shell>
    );
  if (!signup)
    return (
      <Shell>
        <Card role="status" aria-live="polite">
          <CardBody className="p-6 text-center text-muted-foreground">
            Eintragung wird geladen …
          </CardBody>
        </Card>
      </Shell>
    );

  const cancelled = signup.signup_status !== "ACTIVE";
  return (
    <Shell>
      <SignupDetailCard
        signup={signup}
        timezone={organization.timezone}
        cancelSection={
          <section aria-labelledby="cancellation-heading" className="mt-6">
            <h2 id="cancellation-heading" className="text-lg font-semibold">
              Absage
            </h2>
            {cancelled ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Für diese Eintragung ist keine weitere Aktion nötig.
              </p>
            ) : null}
            {!cancelled && signup.can_cancel ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Falls du verhindert bist, kannst du deine Eintragung hier endgültig absagen.
                </p>
                <Button
                  variant="destructive"
                  aria-label="Eintragung endgültig absagen"
                  disabled={cancelling}
                  onClick={() => void cancelSignup()}
                  className="mt-4 w-full sm:w-auto"
                >
                  {cancelling ? "Wird abgesagt …" : "Eintragung absagen"}
                </Button>
              </>
            ) : null}
            {!cancelled && !signup.can_cancel ? (
              <div className="mt-3 rounded-md border border-status-warning/30 bg-status-warning/10 p-4 text-foreground">
                <p className="font-semibold text-status-warning">
                  Direkte Absage nicht mehr möglich
                </p>
                <p className="mt-1 text-sm">{signup.cancellation_guidance}</p>
              </div>
            ) : null}
            {cancelError ? (
              <p
                role="alert"
                className="mt-4 rounded-md border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error"
              >
                Die Absage ist nicht gelungen. Bitte lade die Seite neu oder kontaktiere die
                Koordination.
              </p>
            ) : null}
          </section>
        }
      />
    </Shell>
  );
}

function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-dvh bg-muted/60 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </main>
  );
}
