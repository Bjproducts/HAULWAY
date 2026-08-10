import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type HaulwayEnv = {
  DB?: D1Database;
  UPLOADS?: R2Bucket;
};

let schemaReady: Promise<void> | null = null;

export function getD1() {
  const database = (env as unknown as HaulwayEnv).DB;
  if (!database) throw new Error("Database binding is unavailable.");
  return database;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export function getUploads() {
  const bucket = (env as unknown as HaulwayEnv).UPLOADS;
  if (!bucket) throw new Error("Upload storage binding is unavailable.");
  return bucket;
}

export function ensureSchema() {
  if (!schemaReady) schemaReady = initializeSchema();
  return schemaReady;
}

async function initializeSchema() {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_subject ON sessions(role, subject_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      service_type TEXT NOT NULL,
      item TEXT NOT NULL,
      pickup TEXT NOT NULL,
      dropoff TEXT,
      notes TEXT NOT NULL DEFAULT '',
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      quote_cents INTEGER,
      payment_method TEXT,
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      customer_confirmed INTEGER NOT NULL DEFAULT 0,
      operator_confirmed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_customer_created ON jobs(customer_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_open_status ON jobs(status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS job_media (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      object_key TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_job_media_job ON job_media(job_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      sender TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_messages_job_created ON messages(job_id, created_at)"),
  ]);
  const jobColumns = await db.prepare("PRAGMA table_info(jobs)").all<{ name: string }>();
  if (!jobColumns.results.some((column) => column.name === "payment_status")) {
    await db.prepare("ALTER TABLE jobs ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'").run();
  }
  await db.prepare("PRAGMA optimize").run();
}
