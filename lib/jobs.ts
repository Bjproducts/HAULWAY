import { getSupabase, throwDatabaseError } from "@/db";
import type { AuthSession } from "@/lib/auth";

export type JobRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  service_type: "junk" | "move";
  item: string;
  pickup: string;
  pickup_unit: string | null;
  pickup_building: string | null;
  pickup_stairs: string | null;
  dropoff: string | null;
  dropoff_unit: string | null;
  dropoff_building: string | null;
  dropoff_stairs: string | null;
  fragile: boolean | null;
  notes: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  eta: string | null;
  quote_cents: number | null;
  payment_method: "interac" | "cash" | null;
  payment_status: "unpaid" | "paid";
  customer_confirmed: boolean;
  operator_confirmed: boolean;
  upload_complete: boolean;
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

type JobWithCustomer = Omit<JobRow, "customer_name" | "customer_phone"> & {
  customers: { name: string; phone: string };
};

export async function getJobRow(id: string) {
  const { data, error } = await getSupabase()
    .from("jobs")
    .select("*, customers!inner(name, phone)")
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(error);
  return data ? flattenJob(data as JobWithCustomer) : null;
}

export function canAccessJob(session: AuthSession, job: JobRow) {
  return session.role === "operator" || job.customer_id === session.subjectId;
}

export async function getJobDetails(id: string) {
  const job = await getJobRow(id);
  if (!job) return null;
  const db = getSupabase();
  const [mediaResult, messagesResult] = await Promise.all([
    db.from("job_media")
      .select("id, filename, content_type, size_bytes, created_at")
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
    db.from("messages")
      .select("id, sender, body, created_at")
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
  ]);
  throwDatabaseError(mediaResult.error);
  throwDatabaseError(messagesResult.error);
  const media = (mediaResult.data ?? []) as MediaRow[];
  const messages = (messagesResult.data ?? []) as MessageRow[];
  return {
    ...mapJob(job),
    media: media.map((item) => ({
      id: item.id,
      filename: item.filename,
      contentType: item.content_type,
      sizeBytes: item.size_bytes,
      createdAt: item.created_at,
      url: `/api/media/${item.id}`,
    })),
    messages: messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      body: message.body,
      createdAt: message.created_at,
    })),
  };
}

export function flattenJob(job: JobWithCustomer): JobRow {
  return {
    ...job,
    customer_name: job.customers.name,
    customer_phone: job.customers.phone,
  };
}

export function mapJob(job: JobRow) {
  return {
    id: job.id,
    customer: { id: job.customer_id, name: job.customer_name, phone: job.customer_phone },
    serviceType: job.service_type,
    item: job.item,
    pickup: job.pickup,
    pickupUnit: job.pickup_unit,
    pickupBuilding: job.pickup_building,
    pickupStairs: job.pickup_stairs,
    dropoff: job.dropoff,
    dropoffUnit: job.dropoff_unit,
    dropoffBuilding: job.dropoff_building,
    dropoffStairs: job.dropoff_stairs,
    fragile: job.fragile,
    notes: job.notes,
    scheduledDate: job.scheduled_date,
    scheduledTime: job.scheduled_time,
    status: job.status,
    eta: job.eta,
    quoteCents: job.quote_cents,
    paymentMethod: job.payment_method,
    paymentStatus: job.payment_status,
    customerConfirmed: job.customer_confirmed,
    operatorConfirmed: job.operator_confirmed,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

export async function addSystemMessage(jobId: string, body: string) {
  const { error } = await getSupabase().from("messages").insert({
    id: crypto.randomUUID(),
    job_id: jobId,
    sender: "system",
    body,
  });
  throwDatabaseError(error);
}

export async function updateJob(id: string, values: Record<string, string | number | boolean | null>) {
  const { error } = await getSupabase().from("jobs").update(values).eq("id", id);
  throwDatabaseError(error);
}
