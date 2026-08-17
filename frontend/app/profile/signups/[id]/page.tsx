import { OwnSignupDetail } from "./own-signup-detail";

export default async function OwnSignupDetailRoute({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <OwnSignupDetail signupId={id} />;
}
