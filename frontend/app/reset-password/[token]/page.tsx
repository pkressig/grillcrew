import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params;
  return <ResetPasswordForm token={token} />;
}
