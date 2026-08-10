import { ensureSchema, getD1 } from "@/db";
import type { AuthSession } from "@/lib/auth";

export type JobRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  service_type: "junk" | "move";
  item: string;
  pickup: string;
  dropoff: string | null;
  notes: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  quote_cents: number | null;
  payment_method: "interac" | "cash" | null;
  payment_status: "unpaid" | "paid";
  customer_confirmed: number;
  operator_confirmed: number;
  created_at: string;
  updated_at: string;
};

type MediaRow = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

type MessageRow = {
  id: string;
  sender: "customer" | "operator" | "system";
  body: string;
  created_at: string;
};

export async function getJobRow(id: string) {
  await ensureSchema();
  return getD1().prepare(`SELECT j.*, c.name AS customer_name, c.phone AS customer_phone
    FROM jobs j JOIN customers c ON c.id = j.customer_id WHERE j.id = ?`)
    .bind(id).first<JobRow>();
}

export function canAccessJob(session: AuthSession, job: JobRow) {
  return session.role === "operator" || job.customer_id === session.subjectId;
}

export async function getJobDetails(id: string) {
  const job = await getJobRow(id);
  if (!job) return null;
  const db = getD1();
  const [media, messages] = await Promise.all([
    db.prepare(`SELECT id, filename, content_type, size_bytes, created_at
      FROM job_media WHERE job_id = ? ORDER BY created_at`).bind(id).all<MediaRow>(),
    db.prepare(`SELECT id, sender, body, created_at
      FROM messages WHERE job_id = ? ORDER BY created_at`).bind(id).all<MessageRow>(),
  ]);
  return {
    ...mapJob(job),
    media: media.results.map((item) => ({
      id: item.id,
      filename: item.filename,
      contentType: item.content_type,
      sizeBytes: item.size_bytes,
      createdAt: item.created_at,
      url: `/api/media/${item.id}`,
    })),
    messages: messages.results.map((message) => ({
      id: message.id,
      sender: message.sender,
      body: message.body,
      createdAt: message.created_at,
    })),
  };
}

export function mapJob(job: JobRow) {
  return {
    id: job.id,
    customer: { id: job.customer_id, name: job.customer_name, phone: job.customer_phone },
    serviceType: job.service_type,
    item: job.item,
    pickup: job.pickup,
    dropoff: job.dropoff,
    notes: job.notes,
    scheduledDate: job.scheduled_date,
    scheduledTime: job.scheduled_time,
    status: job.status,
    quoteCents: job.quote_cents,
    paymentMethod: job.payment_method,
    paymentStatus: job.payment_status,
    customerConfirmed: Boolean(job.customer_confirmed),
    operatorConfirmed: Boolean(job.operator_confirmed),
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

