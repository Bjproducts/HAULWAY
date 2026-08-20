import { runSafeRetentionMaintenance } from "../../lib/retention";

export default async function handler() {
  try {
    return Response.json(await runSafeRetentionMaintenance());
  } catch (error) {
    console.error("[retention:scheduled]", error instanceof Error ? error.message : error);
    return Response.json({ error: "Retention maintenance failed." }, { status: 500 });
  }
}

export const config = { schedule: "17 4 * * *" };
