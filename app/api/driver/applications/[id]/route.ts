import { jsonError } from "@/lib/responses";

export async function PATCH() {
  return jsonError("Driver applications have been removed. Owners handle requests directly.", 410);
}
