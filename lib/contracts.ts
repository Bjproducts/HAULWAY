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
  dropoff: string | null;
  notes: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  quoteCents: number | null;
  paymentMethod: "interac" | "cash" | null;
  paymentStatus: "unpaid" | "paid";
  customerConfirmed: boolean;
  operatorConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
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
