import { destroySession } from "@/lib/auth";
import { guardMutation } from "@/lib/security";

export async function POST(request: Request) {
  const blocked = guardMutation(request, { json: false });
  if (blocked) return blocked;
  const cookie = await destroySession(request, "customer");
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
