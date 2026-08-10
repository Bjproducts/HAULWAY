import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("customer experience uses Supabase registration without SMS or card payments", async () => {
  const [page, registration, jobs] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/auth/register/route.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/route.ts", root), "utf8"),
  ]);
  assert.match(page, /Name and number\. That&apos;s it\./);
  assert.match(page, /Interac e-Transfer/);
  assert.match(page, /Cash/);
  assert.doesNotMatch(page, /2468|verification code|Stripe/i);
  assert.match(registration, /getSupabase/);
  assert.match(registration, /from\("customers"\)/);
  assert.match(jobs, /Add at least one photo/);
});

test("operator workflow supports quotes, chat, payment tracking, and two confirmations", async () => {
  const [driver, actions, messages, migration] = await Promise.all([
    readFile(new URL("app/driver/page.tsx", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/messages/route.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260810000000_create_haulway_schema.sql", root), "utf8"),
  ]);
  assert.doesNotMatch(driver, /Marcus|Couch move|Garage cleanout|demo code/i);
  assert.match(actions, /send_quote/);
  assert.match(actions, /accept_quote/);
  assert.match(actions, /payment_method/);
  assert.match(actions, /customer_confirmed/);
  assert.match(actions, /operator_confirmed/);
  assert.match(messages, /from\("messages"\)/);
  assert.match(migration, /create table if not exists public\.customers/);
  assert.match(migration, /create table if not exists public\.jobs/);
  assert.match(migration, /enable row level security/);
});

test("the app uses native Next.js and private Supabase Storage for Netlify", async () => {
  const [database, jobs, media, exampleEnv, packageSource] = await Promise.all([
    readFile(new URL("db/index.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/route.ts", root), "utf8"),
    readFile(new URL("app/api/media/[id]/route.ts", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  assert.match(database, /SUPABASE_SECRET_KEY/);
  assert.match(database, /persistSession: false/);
  assert.match(jobs, /createSignedUploadUrl/);
  assert.match(media, /createSignedUrl/);
  assert.equal(packageJson.scripts.build, "next build");
  assert.equal(packageJson.dependencies.next, "16.3.0");
  assert.doesNotMatch(packageSource, /vinext|wrangler|cloudflare/i);
  assert.match(exampleEnv, /SUPABASE_URL/);
  assert.match(exampleEnv, /SUPABASE_STORAGE_BUCKET/);
  assert.doesNotMatch(exampleEnv, /sb_secret_|eyJ/);
});
