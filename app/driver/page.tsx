"use client";

/* eslint-disable @next/next/no-img-element, jsx-a11y/media-has-caption */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Job, JobDetails } from "@/lib/contracts";
import { INTERAC_EMAIL, money, shortDate } from "@/lib/contracts";
import { Composer, MessageList, useStickyScroll } from "../chat-ui";
import { errorMessage, readJson } from "../http";
import { SwipeAction } from "../swipe-action";

type Gate = "boot" | "setup" | "login" | "dashboard";
type Filter = "new" | "active" | "done";
type Pane = "job" | "chat";

const FILTERS: Array<{ id: Filter; label: string; match: (job: Job) => boolean }> = [
  { id: "new", label: "New", match: (job) => job.status === "requested" },
  { id: "active", label: "Active", match: (job) => ["approved", "quoted", "accepted", "in_progress"].includes(job.status) },
  { id: "done", label: "Done", match: (job) => job.status === "completed" || job.status === "cancelled" },
];
const ARRIVAL_STATUSES = new Set(["approved", "quoted", "accepted", "in_progress"]);

function OperatorLogo() {
  return <span className="op-logo"><span className="op-mark">H</span><span><b>HAULWAY</b><small>OPERATOR</small></span></span>;
}

export default function DriverPortal() {
  const [gate, setGate] = useState<Gate>("boot");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("new");
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadJobs = useCallback(async () => {
    try {
      const data = await operatorFetch("/api/jobs") as { jobs: Job[] };
      setJobs(data.jobs);
      return data.jobs;
    } catch (caught) {
      setError(errorMessage(caught));
      return [] as Job[];
    }
  }, []);

  useEffect(() => {
    operatorFetch("/api/operator/session").then((data) => {
      const session = data as { configured: boolean; authenticated: boolean };
      setGate(session.authenticated ? "dashboard" : session.configured ? "login" : "setup");
    }).catch((caught) => { setError(errorMessage(caught)); setGate("login"); });
  }, []);

  useEffect(() => {
    if (gate !== "dashboard") return;
    let active = true;
    async function poll() {
      try {
        const data = await operatorFetch("/api/jobs") as { jobs: Job[] };
        if (active) setJobs(data.jobs);
      } catch (caught) { if (active) setError(errorMessage(caught)); }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [gate]);

  const counts = useMemo(() => ({
    new: jobs.filter(FILTERS[0].match).length,
    active: jobs.filter(FILTERS[1].match).length,
    done: jobs.filter(FILTERS[2].match).length,
  }), [jobs]);

  async function logout() {
    await fetch("/api/operator/logout", { method: "POST" });
    setJobs([]); setOpenId(null); setGate("login");
  }

  /* Accepting is the driver committing to the job, so land them on it — ETA and
     quote are the very next things they need. */
  async function acceptJob(id: string) {
    setAccepting(id); setError("");
    try {
      await operatorFetch(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ action: "approve_request" }) });
      await loadJobs();
      setOpenId(id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally { setAccepting(null); }
  }

  if (gate === "boot") return <main className="op-boot"><OperatorLogo /><span className="op-loader"><i /></span></main>;
  if (gate === "setup" || gate === "login") return <OperatorGate mode={gate} error={error} onError={setError} onSuccess={() => { setError(""); setGate("dashboard"); }} />;

  if (openId) return <OperatorJob jobId={openId} onBack={() => { setOpenId(null); void loadJobs(); }} onChanged={loadJobs} />;

  const visible = jobs.filter(FILTERS.find((entry) => entry.id === filter)!.match);
  return <div className="op-shell">
    <header className="op-bar">
      <OperatorLogo />
      <span className="op-online"><i />Open</span>
      <button className="op-signout" onClick={() => void logout()} aria-label="Sign out">↪</button>
    </header>

    <div className="op-top">
      <div className="op-metrics">
        <div><small>NEW</small><strong>{counts.new}</strong></div>
        <div><small>ACTIVE</small><strong>{counts.active}</strong></div>
        <div><small>DONE</small><strong>{counts.done}</strong></div>
      </div>
      <div className="op-filters" role="tablist">
        {FILTERS.map((entry) => <button key={entry.id} role="tab" aria-selected={filter === entry.id} className={filter === entry.id ? "active" : ""} onClick={() => setFilter(entry.id)}>
          {entry.label}<i>{counts[entry.id]}</i>
        </button>)}
      </div>
      <span className="op-refresh-note"><i aria-hidden="true" />Live queue · refreshes automatically</span>
      {error && <p className="op-error">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></p>}
    </div>

    <main className="op-list">
      {visible.length ? visible.map((job) => <div key={job.id} className="op-card">
        <button className="op-card-main" onClick={() => setOpenId(job.id)}>
          <span className="op-card-top">
            <span className={`status-pill ${job.status}`}>{statusLabel(job)}</span>
            {job.fragile && <span className="op-flag">Fragile</span>}
          </span>
          <strong>{job.item}</strong>
          <small>{job.customer.name} · {job.pickup}</small>
          <span className="op-card-foot">
            <b>{shortDate(job.scheduledDate)} · {job.scheduledTime}</b>
            <em>{job.quoteCents ? money(job.quoteCents) : etaLabel(job)}</em>
          </span>
        </button>
        {/* Taking a job from the list drops the driver straight into it. */}
        {job.status === "requested" && <button className="op-card-accept" disabled={accepting === job.id} onClick={() => void acceptJob(job.id)}>
          {accepting === job.id ? "Accepting…" : "Accept this request"}<span aria-hidden="true">→</span>
        </button>}
      </div>) : <div className="op-empty">
        <span>✓</span>
        <strong>Nothing {filter === "new" ? "new" : filter === "active" ? "active" : "here"}.</strong>
        <small>{filter === "new" ? "New customer requests land here automatically." : filter === "active" ? "Accepted jobs show up here." : "Completed and cancelled jobs collect here."}</small>
      </div>}
    </main>
  </div>;
}

/* ---------- gate ---------- */

function OperatorGate({ mode, error, onError, onSuccess }: { mode: "setup" | "login"; error: string; onError: (error: string) => void; onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); onError("");
    if (!/^\d{6}$/.test(pin)) return onError("Enter a 6-digit PIN.");
    if (mode === "setup" && pin !== confirm) return onError("The PINs do not match.");
    setBusy(true);
    try { await fetch(`/api/operator/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, setupToken }) }).then(readJson); onSuccess(); }
    catch (caught) { onError(errorMessage(caught)); } finally { setBusy(false); }
  }

  return <main className="op-gate">
    <div className="op-gate-top"><OperatorLogo /></div>
    <form className="op-gate-sheet" onSubmit={submit}>
      <span className="op-gate-icon">H</span>
      <span className="micro-label">{mode === "setup" ? "FIRST-TIME SETUP" : "OPERATOR SIGN IN"}</span>
      <h1>{mode === "setup" ? "Secure your portal." : "Welcome back."}</h1>
      <p>{mode === "setup" ? "Create the private PIN you'll use to manage Haulway jobs." : "Enter your private operator PIN."}</p>
      {mode === "setup" && <label>Private setup token
        <input className="op-setup-token" type="password" autoComplete="off" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} placeholder="From your environment settings" />
      </label>}
      <label>{mode === "setup" ? "Create a 6-digit PIN" : "6-digit PIN"}
        <input className="op-code" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} placeholder="••••••" />
      </label>
      {mode === "setup" && <label>Confirm PIN
        <input className="op-code" type="password" inputMode="numeric" maxLength={6} value={confirm} onChange={(event) => setConfirm(event.target.value.replace(/\D/g, ""))} placeholder="••••••" />
      </label>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="hw-primary wide" disabled={busy}>{busy ? "Please wait…" : mode === "setup" ? "Create operator account" : "Sign in"}<span aria-hidden="true">→</span></button>
      <span className="op-gate-trust">Private access · session protected</span>
      {mode === "setup" && <small>Do this before sharing the customer website.</small>}
    </form>
  </main>;
}

/* ---------- one job ---------- */

function OperatorJob({ jobId, onBack, onChanged }: { jobId: string; onBack: () => void; onChanged: () => Promise<Job[]> }) {
  const [job, setJob] = useState<JobDetails | null>(null);
  const [pane, setPane] = useState<Pane>("job");
  const [quote, setQuote] = useState("");
  const [etaMinutes, setEtaMinutes] = useState("");
  const etaTouched = useRef(false);
  const etaInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  const { ref: chatScrollRef, pinned: chatPinned, jump: jumpToLatest } = useStickyScroll((job?.messages.length ?? 0) + pending.length);
  const quoteTouched = useRef(false);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await operatorFetch(`/api/jobs/${jobId}`) as { job: JobDetails };
        if (!active) return;
        setJob(data.job);
        if (!quoteTouched.current) setQuote(data.job.quoteCents ? String(data.job.quoteCents / 100) : "");
        if (!etaTouched.current) setEtaMinutes(remainingEtaInput(data.job));
      } catch { /* retry on next poll */ }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [jobId]);

  async function action(actionName: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      const data = await operatorFetch(`/api/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify({ action: actionName, ...extra }) }) as { job: JobDetails };
      setJob(data.job); quoteTouched.current = false; etaTouched.current = false; await onChanged();
      /* Just took the job — the ETA is the next thing the customer is waiting on. */
      if (actionName === "approve_request") window.setTimeout(() => etaInput.current?.focus(), 60);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally { setBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = message.trim();
    if (!body) return;
    setMessage(""); setError("");
    setPending((queue) => [...queue, body]);
    try {
      const data = await operatorFetch(`/api/jobs/${jobId}/messages`, { method: "POST", body: JSON.stringify({ body }) }) as { job: JobDetails };
      setJob(data.job);
    } catch (caught) {
      setError(errorMessage(caught));
      setMessage((current) => current || body);
    } finally { setPending((queue) => queue.slice(1)); }
  }

  if (!job) return <div className="op-shell">
    <header className="op-bar"><button className="op-back" onClick={onBack} aria-label="Back">←</button></header>
    <main className="op-detail"><div className="skeleton-card" /></main>
  </div>;

  const media = job.media.map((entry) => ({ ...entry, operatorUrl: `${entry.url}?role=operator` }));

  return <div className="op-shell">
    <header className="op-bar">
      <button className="op-back" onClick={onBack} aria-label="Back to requests">←</button>
      <div className="op-bar-title"><strong>{job.item}</strong><small>{job.customer.name}</small></div>
      <a className="op-call" href={`tel:${job.customer.phone}`} aria-label={`Call ${job.customer.name}`}>☎</a>
    </header>

    <div className="op-segment" role="tablist">
      <button role="tab" aria-selected={pane === "job"} className={pane === "job" ? "active" : ""} onClick={() => setPane("job")}>Job</button>
      <button role="tab" aria-selected={pane === "chat"} className={pane === "chat" ? "active" : ""} onClick={() => setPane("chat")}>Chat<i>{job.messages.length}</i></button>
    </div>

    {pane === "job" ? <main className="op-detail">
      <span className={`status-pill ${job.status}`}>{statusLabel(job)}</span>
      <div className="op-job-snapshot">
        <span><small>SCHEDULED</small><strong>{shortDate(job.scheduledDate)} · {job.scheduledTime}</strong></span>
        <span><small>LIVE ETA</small><strong>{etaLabel(job)}</strong></span>
      </div>

      {media.length > 0 && <div className="op-media">{media.map((entry) => entry.contentType.startsWith("video/")
        ? <video key={entry.id} src={entry.operatorUrl} controls playsInline />
        : <img key={entry.id} src={entry.operatorUrl} alt={entry.filename} />)}</div>}

      <div className="op-route">
        <div>
          <i>A</i>
          <span>
            <small>PICKUP</small>
            <strong>{withUnit(job.pickup, job.pickupUnit)}</strong>
            <b>{siteSummary(job.pickupBuilding, job.pickupStairs)}</b>
          </span>
        </div>
        {job.dropoff && <div>
          <i>B</i>
          <span>
            <small>DROP-OFF</small>
            <strong>{withUnit(job.dropoff ?? "", job.dropoffUnit)}</strong>
            <b>{siteSummary(job.dropoffBuilding, job.dropoffStairs)}</b>
          </span>
        </div>}
      </div>

      {job.fragile === true && <div className="op-fragile">⚠ Fragile — handle with care</div>}

      <dl className="op-facts">
        <div><dt>When</dt><dd>{shortDate(job.scheduledDate)} · {job.scheduledTime}</dd></div>
        <div><dt>Fragile</dt><dd>{job.fragile === true ? "Yes — handle with care" : job.fragile === false ? "No" : "Not answered"}</dd></div>
        <div><dt>Customer</dt><dd><a href={`tel:${job.customer.phone}`}>{job.customer.phone}</a></dd></div>
        <div><dt>Notes</dt><dd>{job.notes || "No extra notes."}</dd></div>
      </dl>

      {job.status === "completed" && <div className="op-payment">
        <small>PAYMENT</small>
        <strong>{job.paymentMethod === "interac" ? `Interac e-Transfer to ${INTERAC_EMAIL}` : job.paymentMethod === "cash" ? "Cash on completion" : "Customer has not chosen yet"}</strong>
        <span className={job.paymentStatus}>{job.paymentStatus === "paid" ? "Received ✓" : "Waiting"}</span>
        {job.paymentMethod && job.paymentStatus !== "paid" && <button disabled={busy} onClick={() => void action("mark_paid")}>Mark paid</button>}
      </div>}
    </main> : <main className="op-chat">
      <div className="chat-scroll" ref={chatScrollRef} role="log" aria-live="polite" aria-label={`Conversation with ${job.customer.name}`}>
        {!job.messages.length && !pending.length && <p className="chat-hint">Message {job.customer.name} about timing, access, or the quote.</p>}
        <MessageList messages={job.messages} mine="operator" nameFor={(sender) => sender === "operator" ? "You" : job.customer.name} pending={pending} />
      </div>
      {!chatPinned && <button className="jump-latest" onClick={jumpToLatest}>Latest<span aria-hidden="true">↓</span></button>}
      <Composer value={message} onChange={setMessage} onSend={send} busy={busy} placeholder={`Message ${job.customer.name.split(" ")[0]}…`} />
    </main>}

    {error && <p className="op-error inline">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></p>}

    <div className="op-actions">
      {job.status !== "completed" && job.status !== "cancelled" && <div className="op-action-context"><span>NEXT ACTION</span><small>Customer updates automatically</small></div>}
      {job.status === "requested" && <button className="op-accept" disabled={busy} onClick={() => void action("approve_request")}>Accept this request<span aria-hidden="true">→</span></button>}

      {job.status !== "requested" && job.status !== "completed" && job.status !== "cancelled" && !job.driverArrived && <section className={`op-eta-panel ${job.etaDueAt ? "running" : ""}`}>
        <div className="op-eta-heading">
          <span><small>{job.etaDueAt ? "COUNTDOWN RUNNING" : "CUSTOMER ETA"}</small><strong>{job.etaDueAt ? `${etaLabel(job)} remaining` : "Start the customer’s timer"}</strong></span>
          {job.etaDueAt && <i aria-hidden="true" />}
        </div>
        <div className="op-eta">
          <label><input ref={etaInput} type="number" inputMode="numeric" min="1" max="360" value={etaMinutes} onChange={(event) => { etaTouched.current = true; setEtaMinutes(event.target.value.replace(/\D/g, "").slice(0, 3)); }} placeholder="25" aria-label="Estimated arrival in minutes" /><span>MIN</span></label>
          <button disabled={busy || !etaMinutes || Number(etaMinutes) < 1 || Number(etaMinutes) > 360} onClick={() => void action("set_eta", { etaMinutes: Number(etaMinutes) })}>{job.etaDueAt ? "Change timer" : "Start timer"}</button>
        </div>
        <p>The customer’s countdown updates automatically.</p>
      </section>}

      {(job.status === "approved" || job.status === "quoted") && <div className="op-quote">
        <label><span>$</span><input inputMode="decimal" value={quote} onChange={(event) => { quoteTouched.current = true; setQuote(event.target.value.replace(/[^\d.]/g, "")); }} placeholder="0.00" /></label>
        <button disabled={busy || !quote} onClick={() => void action("send_quote", { amount: Number(quote) })}>{job.quoteCents ? "Update quote" : "Send quote"}</button>
      </div>}

      {ARRIVAL_STATUSES.has(job.status) && <section className={`op-arrival-card ${job.driverArrived ? "arrived" : ""}`}>
        <div><small>{job.driverArrived ? "ARRIVAL CONFIRMED" : "AT THE PICKUP"}</small><strong>{job.driverArrived ? "The customer knows you’re here." : "Let the customer know you arrived."}</strong></div>
        <SwipeAction
          busy={busy}
          confirmed={job.driverArrived}
          label="Swipe when you arrive"
          confirmedLabel="Driver arrived ✓"
          tone="arrival"
          onConfirm={() => action("mark_arrived")}
        />
      </section>}

      {job.status === "in_progress" && job.driverArrived && <button className="op-accept" disabled={busy || job.operatorConfirmed} onClick={() => void action("confirm_complete")}>{job.operatorConfirmed ? "Waiting on the customer ✓" : "Confirm job complete"}</button>}

      {job.status === "cancelled" && <div className="op-cancelled">Cancelled by the customer</div>}
    </div>
  </div>;
}

/* ---------- helpers ---------- */

async function operatorFetch(input: string, init: RequestInit = {}) {
  const response = await fetch(input, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", "x-haulway-role": "operator", ...init.headers } });
  return readJson(response);
}
function siteSummary(building: string | null, stairs: string | null) {
  const parts = [building, stairs].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Building details not given";
}
function withUnit(address: string, unit: string | null) {
  return unit ? `Unit ${unit} — ${address}` : address;
}
function etaLabel(job: Job) {
  if (job.driverArrived) return "Arrived";
  if (!job.etaDueAt) return job.eta ?? "ETA not set";
  const minutes = Math.max(0, Math.ceil((Date.parse(job.etaDueAt) - Date.now()) / 60_000));
  return `${minutes} min`;
}

function remainingEtaInput(job: Job) {
  if (!job.etaDueAt || job.driverArrived) return "";
  return String(Math.max(1, Math.ceil((Date.parse(job.etaDueAt) - Date.now()) / 60_000)));
}

function statusLabel(job: Job) {
  if (job.driverArrived && job.status !== "completed") return "Arrived";
  return ({ requested: "Needs approval", approved: "Needs quote", quoted: "Quote sent", accepted: "Booked", in_progress: "In progress", completed: "Complete", cancelled: "Cancelled" } as Record<string, string>)[job.status] ?? job.status;
}
