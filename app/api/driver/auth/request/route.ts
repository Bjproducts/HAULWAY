import { jsonError } from "@/lib/responses";

export async function POST() {
  return jsonError("Driver access has been removed. Owners manage requests in the operator portal.", 410);
}
