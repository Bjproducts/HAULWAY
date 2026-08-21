import { jsonError } from "@/lib/responses";

export async function GET() {
  return jsonError("Driver applications have been removed. Owners handle requests directly.", 410);
}
