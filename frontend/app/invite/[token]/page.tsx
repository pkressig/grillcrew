import { apiBaseUrl } from "@/lib/api";
import { InvitationForm, type InvitationPreview } from "./invitation-form";

export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params;
  let preview: InvitationPreview | null = null;
  try {
    const response = await fetch(apiBaseUrl + "/api/invitations/" + encodeURIComponent(token), {
      cache: "no-store",
    });
    if (response.ok) preview = (await response.json()) as InvitationPreview;
  } catch {
    preview = null;
  }
  return <InvitationForm token={token} preview={preview} />;
}
