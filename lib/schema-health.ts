import expectedMigrations from "@/config/schema-migrations.json";
import { getSupabase } from "@/db";

export async function databaseMigrationHealth() {
  const { data, error } = await getSupabase()
    .from("haulway_schema_migrations")
    .select("version")
    .order("version", { ascending: true });

  if (error) return { ok: false, missing: [...expectedMigrations], unexpected: [], error: error.message };
  const applied = new Set((data ?? []).map((row) => row.version));
  const expected = new Set(expectedMigrations);
  return {
    ok: expectedMigrations.every((version) => applied.has(version)) && [...applied].every((version) => expected.has(version)),
    missing: expectedMigrations.filter((version) => !applied.has(version)),
    unexpected: [...applied].filter((version) => !expected.has(version)),
    error: null,
  };
}
