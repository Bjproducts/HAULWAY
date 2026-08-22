import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const expected = JSON.parse(await readFile(new URL("config/schema-migrations.json", root), "utf8"));
const actual = (await readdir(new URL("supabase/migrations/", root))).filter((name) => name.endsWith(".sql")).sort();

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error("[deploy:migrations] Migration files and config/schema-migrations.json are out of sync.");
  console.error(`Expected: ${expected.join(", ")}`);
  console.error(`Found: ${actual.join(", ")}`);
  process.exit(1);
}

const sql = (await Promise.all(actual.map((name) => readFile(new URL(`supabase/migrations/${name}`, root), "utf8")))).join("\n");
const untracked = expected.filter((name) => !sql.includes(`'${name}'`));
if (untracked.length) {
  console.error(`[deploy:migrations] Every migration must register in haulway_schema_migrations. Missing ledger entries: ${untracked.join(", ")}`);
  process.exit(1);
}

console.log(`[deploy:migrations] ${actual.length} ordered migrations are represented in the database ledger.`);
