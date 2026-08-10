import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_customers_phone").on(table.phone)]);

export const operators = sqliteTable("operators", {
  id: text("id").primaryKey(),
  pinHash: text("pin_hash").notNull(),
  pinSalt: text("pin_salt").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  role: text("role", { enum: ["customer", "operator"] }).notNull(),
  subjectId: text("subject_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_sessions_subject").on(table.role, table.subjectId)]);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  serviceType: text("service_type", { enum: ["junk", "move"] }).notNull(),
  item: text("item").notNull(),
  pickup: text("pickup").notNull(),
  dropoff: text("dropoff"),
  notes: text("notes").notNull().default(""),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  status: text("status").notNull().default("requested"),
  quoteCents: integer("quote_cents"),
  paymentMethod: text("payment_method", { enum: ["interac", "cash"] }),
  paymentStatus: text("payment_status", { enum: ["unpaid", "paid"] }).notNull().default("unpaid"),
  customerConfirmed: integer("customer_confirmed", { mode: "boolean" }).notNull().default(false),
  operatorConfirmed: integer("operator_confirmed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_jobs_customer_created").on(table.customerId, table.createdAt),
  index("idx_jobs_open_status").on(table.status),
]);

export const jobMedia = sqliteTable("job_media", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id),
  objectKey: text("object_key").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_job_media_job").on(table.jobId)]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id),
  sender: text("sender", { enum: ["customer", "operator", "system"] }).notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_messages_job_created").on(table.jobId, table.createdAt)]);
