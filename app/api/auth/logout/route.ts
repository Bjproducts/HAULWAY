import { destroySession } from "@/lib/auth";

export async function POST(request: Request) {
  const cookie = await destroySession(request, "customer");
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

