import { getSupabase, throwDatabaseError } from "@/db";
import { productionConfigurationIssues } from "@/lib/configuration";
import { databaseMigrationHealth } from "@/lib/schema-health";

export async function GET() {
  const configurationIssues = productionConfigurationIssues();
  let database: "ok" | "unavailable" = "unavailable";
  let migrations: "ok" | "drift" | "unavailable" = "unavailable";

  try {
    const { error } = await getSupabase().from("customers").select("id").limit(1);
    throwDatabaseError(error);
    database = "ok";

    const migrationHealth = await databaseMigrationHealth();
    migrations = migrationHealth.ok ? "ok" : "drift";
    if (!migrationHealth.ok) {
      console.error("[health:migrations]", {
        missing: migrationHealth.missing,
        unexpected: migrationHealth.unexpected,
        error: migrationHealth.error,
      });
    }
  } catch (error) {
    console.error("[health]", error instanceof Error ? error.message : error);
  }

  if (configurationIssues.length) console.error("[health:configuration]", configurationIssues);
  const healthy = !configurationIssues.length && database === "ok" && migrations === "ok";
  return Response.json({
    status: healthy ? "ok" : "unavailable",
    service: "haulway",
    checks: {
      configuration: configurationIssues.length ? "invalid" : "ok",
      database,
      migrations,
    },
  }, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
