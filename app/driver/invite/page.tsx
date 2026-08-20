import { AdminInvitationForm } from "./invitation-form";

export default async function AdminInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const rawToken = (await searchParams).token;
  const token = typeof rawToken === "string" && rawToken.length <= 200 ? rawToken : "";
  return <AdminInvitationForm token={token} />;
}
