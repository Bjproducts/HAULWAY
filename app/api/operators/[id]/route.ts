import { jsonError } from "@/lib/responses";

export async function PATCH() {
  return jsonError("Driver management has been removed. Owners handle requests directly.", 410);
}
