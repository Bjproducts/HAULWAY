/* Where customers send an Interac e-Transfer once a job is confirmed complete. */
export const INTERAC_EMAIL = "jbuoapu@gmail.com";

/* Shared so the form and the API agree on what a valid answer looks like. */
export const BUILDING_TYPES = ["House", "Apartment", "Townhouse", "Commercial", "Other"] as const;
/* Picking this one reveals the unit-number field. */
export const NEEDS_UNIT = "Apartment";

/* A customer stays with one unfinished haul from booking through completion. */
export const MAX_ACTIVE_REQUESTS = 1;
export const ACTIVE_JOB_STATUSES = ["requested", "approved", "quoted", "accepted", "in_progress"] as const;
export const STAIRS_OPTIONS = ["No stairs", "1 flight", "2+ flights", "Elevator"] as const;

export type Customer = { id: string; name: string; phone: string };

export type Message = {
  id: string;
  sender: "customer" | "operator" | "system";
  body: string;
  createdAt: string;
};

export type JobMedia = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
};

export type Job = {
  id: string;
  customer: Customer;
  serviceType: "junk" | "move";
  item: string;
  pickup: string;
  pickupUnit: string | null;
  pickupBuilding: string | null;
  pickupStairs: string | null;
  dropoff: string | null;
  dropoffUnit: string | null;
  dropoffBuilding: string | null;
  dropoffStairs: string | null;
  fragile: boolean | null;
  notes: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  eta: string | null;
  quoteCents: number | null;
  paymentMethod: "interac" | "cash" | null;
  paymentStatus: "unpaid" | "paid";
  customerConfirmed: boolean;
  operatorConfirmed: boolean;
  customerRating: number | null;
  ratingSkipped: boolean;
  createdAt: string;
  updatedAt: string;
  /* Only present on the list endpoint — powers the "new activity" dot. */
  messageCount?: number;
};

export type JobDetails = Job & { media: JobMedia[]; messages: Message[] };

export function money(cents: number | null) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

export function shortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(date);
}
