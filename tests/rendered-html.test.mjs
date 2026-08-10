import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("customer experience uses database registration without SMS or card payments", async () => {
  const [page, registration, jobs] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/auth/register/route.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/route.ts", root), "utf8"),
  ]);
  assert.match(page, /Name and number\. That&apos;s it\./);
  assert.match(page, /Interac e-Transfer/);
  assert.match(page, /Cash/);
  assert.doesNotMatch(page, /2468|verification code|Stripe/i);
  assert.match(registration, /INSERT INTO customers/);
  assert.match(jobs, /Add at least one photo/);
});

test("operator workflow supports quotes, chat, payment tracking, and two confirmations", async () => {
  const [driver, actions, messages, schema] = await Promise.all([
    readFile(new URL("app/driver/page.tsx", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/messages/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);
  assert.doesNotMatch(driver, /Marcus|Couch move|Garage cleanout|demo code/i);
  assert.match(actions, /send_quote/);
  assert.match(actions, /accept_quote/);
  assert.match(actions, /payment_method/);
  assert.match(actions, /customer_confirmed/);
  assert.match(actions, /operator_confirmed/);
  assert.match(messages, /INSERT INTO messages/);
  assert.match(schema, /export const customers/);
  assert.match(schema, /export const jobs/);
});

