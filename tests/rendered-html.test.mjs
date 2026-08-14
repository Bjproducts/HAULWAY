import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("customer access requires a Supabase SMS OTP before creating an app session", async () => {
  const [page, registration, verification, jobs] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/auth/register/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/verify/route.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/route.ts", root), "utf8"),
  ]);
  assert.match(page, /SMS verified/);
  assert.match(page, /one-time-code/);
  assert.match(page, /Interac e-Transfer/);
  assert.match(page, /Cash/);
  assert.doesNotMatch(page, /2468|Stripe/i);
  assert.match(registration, /signInWithOtp/);
  assert.doesNotMatch(registration, /createSession/);
  assert.match(verification, /verifyOtp/);
  assert.match(verification, /type: "sms"/);
  assert.match(verification, /createSession\("customer"/);
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

test("security controls and durable request-update SMS are wired end to end", async () => {
  const [security, actions, messages, uploads, sms, migration, operatorSetup, config, exampleEnv] = await Promise.all([
    readFile(new URL("lib/security.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/messages/route.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/uploads/route.ts", root), "utf8"),
    readFile(new URL("lib/sms.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260811000000_security_sms.sql", root), "utf8"),
    readFile(new URL("app/api/operator/setup/route.ts", root), "utf8"),
    readFile(new URL("next.config.ts", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
  ]);
  assert.match(security, /Cross-site request blocked/);
  assert.match(security, /consume_rate_limit/);
  assert.match(actions, /Only an active booked job can be confirmed complete/);
  assert.match(actions, /job must be completed before payment is recorded/i);
  assert.match(actions, /notifyJobSms/);
  assert.match(messages, /notifyJobSms/);
  assert.match(uploads, /Reply STOP to opt out/);
  assert.match(sms, /from\("sms_outbox"\)/);
  assert.match(sms, /api\.twilio\.com/);
  assert.match(migration, /create table if not exists public\.rate_limits/);
  assert.match(migration, /create table if not exists public\.sms_outbox/);
  assert.match(migration, /delete from public\.sessions where role = 'customer'/);
  assert.match(migration, /customers_auth_user_id_key/);
  assert.match(operatorSetup, /OPERATOR_SETUP_TOKEN/);
  assert.match(config, /Content-Security-Policy/);
  assert.match(exampleEnv, /TWILIO_API_KEY_SECRET/);
  assert.doesNotMatch(exampleEnv, /sb_secret_|eyJ/);
});

test("customer requests stay progress-first with optional chat and swipe completion", async () => {
  const [page, styles, actions, ratingMigration, jobsData] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/route.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260812000000_customer_ratings.sql", root), "utf8"),
    readFile(new URL("lib/jobs.ts", root), "utf8"),
  ]);
  assert.match(page, /const \[showChat, setShowChat\] = useState\(false\)/);
  /* Progress leads the order page: the stepper must render above the compact
     status card, without bringing back the decorative driver/map artwork. */
  const trackBody = page.slice(page.indexOf('<div className="track-body">'));
  assert.ok(
    trackBody.indexOf("journey-card") > -1 && trackBody.indexOf("journey-card") < trackBody.indexOf("tracker-summary"),
    "haul progress should render before the status summary on the order page",
  );
  assert.doesNotMatch(page, /function RouteMap|rm-truck|route-map/);
  assert.match(styles, /\.tracker-summary/);
  assert.doesNotMatch(styles, /\.rm-truck|\.route-map/);
  assert.match(page, /ESTIMATED ARRIVAL/);
  assert.match(page, /Message Haulway/);
  assert.match(page, /function SwipeToConfirm/);
  assert.match(page, /Swipe to confirm complete/);
  assert.doesNotMatch(page, /Payment only unlocks after both sides confirm/);
  assert.match(styles, /\.completion-card[^}]*text-align: center/);
  assert.doesNotMatch(page, /className="complete-button"/);
  assert.match(styles, /\.swipe-confirm/);
  assert.match(styles, /touch-action: none/);
  assert.match(styles, /prefers-reduced-motion/);
  /* The order page must not clip. A hidden overflow here silently cut cards off
     instead of fitting them; fit comes from putting less on the page (one trip
     card, a pinned message bar), and the scroll is the safety valve for long
     addresses or an expanded quote. */
  assert.match(styles, /\.track-body[^}]*overflow-y: auto/);
  assert.doesNotMatch(styles, /\.track-body[^}]*overflow: hidden/);
  assert.match(styles, /\.message-bar/);
  assert.match(page, /setTimeout\(\(\) => dismiss\.current\(update\.id\), 4500\)/);
  assert.match(page, /How was your haul\?/);
  assert.match(page, /Not now/);
  assert.match(page, /onHome\(\)/);
  assert.match(actions, /body\.action === "rate_job"/);
  assert.match(actions, /Choose a rating from 1 to 5 stars/);
  assert.match(actions, /Customer rated this haul/);
  assert.match(jobsData, /fallbackRating/);
  assert.match(ratingMigration, /customer_rating smallint/);
  assert.match(ratingMigration, /rating_skipped boolean/);
});

test("customers can book only one active haul and stay focused on it", async () => {
  const [page, styles, jobs, uploads, contracts, migration] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/api/jobs/route.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/uploads/route.ts", root), "utf8"),
    readFile(new URL("lib/contracts.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260813000000_one_active_haul.sql", root), "utf8"),
  ]);
  assert.match(contracts, /MAX_ACTIVE_REQUESTS = 1/);
  assert.match(contracts, /ACTIVE_JOB_STATUSES/);
  assert.match(jobs, /\.in\("status", \[\.\.\.ACTIVE_JOB_STATUSES\]\)/);
  assert.match(jobs, /You already have an active haul/);
  assert.match(uploads, /finalizeError\?\.code === "23505"/);
  assert.match(migration, /before insert or update of upload_complete, status on public\.jobs/);
  assert.match(migration, /prevent_second_active_haul/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /and upload_complete/);
  assert.match(page, /const focusLocked = focusedJob !== null/);
  assert.match(page, /activeJobId/);
  assert.match(page, /!focusLocked && <nav className="tab-bar">/);
  assert.match(page, /focusLocked \? <FocusContext \/>/);
  assert.match(styles, /\.app-shell\.focus-mode/);
  assert.match(styles, /\.focus-badge/);
});
