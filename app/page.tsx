"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Customer, Job, JobDetails } from "@/lib/contracts";
import { money, shortDate } from "@/lib/contracts";

type Screen = "boot" | "auth" | "app" | "request" | "sent";
type Tab = "home" | "requests";
type Service = "junk" | "move";
type Upload = { id: string; file: File; url: string; kind: "image" | "video" };

/* A customer can back out until they have accepted a quote — mirrors the API guard. */
const CANCELLABLE = new Set(["requested", "approved", "quoted"]);

function Logo({ light = false }: { light?: boolean }) {
  return <span className={`hw-logo ${light ? "light" : ""}`}><span className="hw-mark">H</span><span>HAULWAY</span></span>;
}

export default function CustomerApp() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [tab, setTab] = useState<Tab>("home");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [service, setService] = useState<Service>("junk");
  const [notice, setNotice] = useState("");

  const refreshJobs = useCallback(async () => {
    try {
      const data = await fetch("/api/jobs", { cache: "no-store" }).then(readJson) as { jobs: Job[] };
      setJobs(data.jobs);
      return data.jobs;
    } catch {
      return [] as Job[];
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/auth/me", { cache: "no-store" }).then(readJson), wait(1500)])
      .then(([data]) => {
        if (!active) return;
        const next = (data as { customer: Customer | null }).customer;
        setCustomer(next);
        setScreen(next ? "app" : "auth");
        if (next) void refreshJobs();
      })
      .catch(() => active && setScreen("auth"));
    return () => { active = false; };
  }, [refreshJobs]);

  useEffect(() => {
    if (screen !== "app") return;
    const timer = window.setInterval(() => void refreshJobs(), 5000);
    return () => window.clearInterval(timer);
  }, [screen, refreshJobs]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setCustomer(null); setJobs([]); setOpenJobId(null);
    setTab("home"); setScreen("auth");
  }

  function goTab(next: Tab) {
    setTab(next); setNotice("");
    if (next !== "requests") setOpenJobId(null);
  }

  if (screen === "boot") return <Splash />;
  if (screen === "auth") return <Registration onRegistered={(next) => { setCustomer(next); setScreen("app"); void refreshJobs(); }} />;
  if (screen === "request" && customer) {
    return <RequestFlow service={service} onCancel={() => setScreen("app")} onCreated={async () => {
      setScreen("sent");
      await refreshJobs();
    }} />;
  }
  /* Straight to the requests list — the customer just filled this in, so there is no
     reason to show their own photos back to them. */
  if (screen === "sent") {
    return <RequestSent onDone={() => { setTab("requests"); setOpenJobId(null); setNotice(""); setScreen("app"); void refreshJobs(); }} />;
  }
  if (!customer) return <Splash />;

  return (
    <div className="app-shell">
      <header className="app-bar">
        <button className="app-bar-logo" onClick={() => goTab("home")} aria-label="Haulway home"><Logo /></button>
        <button className="app-avatar" onClick={() => void signOut()} title="Sign out">{initials(customer.name)}</button>
      </header>

      <main className="app-body">
        {tab === "home" && <HomeTab customer={customer} activeCount={jobs.filter((job) => job.status !== "completed").length} onPick={(picked) => { setService(picked); setScreen("request"); }} />}
        {/* Opening a request shows either "waiting to be approved" or its chat. */}
        {tab === "requests" && (openJobId
          ? <RequestView jobId={openJobId} onBack={() => { setOpenJobId(null); setNotice(""); void refreshJobs(); }} onChanged={refreshJobs} />
          : <RequestsTab jobs={jobs} notice={notice} onOpen={setOpenJobId} onNew={() => goTab("home")} />)}
      </main>

      <nav className="tab-bar">
        <TabButton icon="⌂" label="Home" active={tab === "home"} onClick={() => goTab("home")} />
        <TabButton icon="▤" label="Requests" active={tab === "requests"} badge={jobs.filter((job) => job.status !== "completed").length} onClick={() => goTab("requests")} />
      </nav>
    </div>
  );
}

function TabButton({ icon, label, active, badge = 0, onClick }: { icon: string; label: string; active: boolean; badge?: number; onClick: () => void }) {
  return <button className={`tab-button ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
    <span className="tab-icon">{icon}{badge > 0 && <i>{badge}</i>}</span>{label}
  </button>;
}

/* ---------- Home ---------- */

function HomeTab({ customer, activeCount, onPick }: { customer: Customer; activeCount: number; onPick: (service: Service) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(true), 1100);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="home-tab">
      <div className="home-greeting">
        <span className="micro-label enter" style={{ animationDelay: ".05s" }}>HI {customer.name.split(" ")[0].toUpperCase()}</span>
        <h1>
          <span className="enter" style={{ animationDelay: ".18s" }}>Ohh, what can</span>
          <span className="enter" style={{ animationDelay: ".30s" }}>we help you</span>
          <span className="enter accent" style={{ animationDelay: ".42s" }}>with today?</span>
        </h1>
      </div>

      <div className={`service-picker enter ${open ? "open" : ""}`} style={{ animationDelay: ".58s" }}>
        <button className="picker-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="service-options">
          <span className="picker-dot" aria-hidden="true" />
          <span>Choose a service</span>
          <span className="picker-caret" aria-hidden="true">▾</span>
        </button>
        <div className="picker-drop" id="service-options" role="group" aria-label="Services">
          <div className="picker-drop-inner">
            <button className="service-option junk" onClick={() => onPick("junk")} tabIndex={open ? 0 : -1}>
              <span className="option-index">01</span>
              <span className="option-copy"><strong>Junk removal</strong><small>Clear it out — one item or a full load.</small></span>
              <span className="option-go" aria-hidden="true">→</span>
            </button>
            <button className="service-option move" onClick={() => onPick("move")} tabIndex={open ? 0 : -1}>
              <span className="option-index">02</span>
              <span className="option-copy"><strong>Small-scale moving</strong><small>A few things, across town.</small></span>
              <span className="option-go" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>

      <div className="home-foot enter" style={{ animationDelay: ".72s" }}>
        <span>Edmonton</span><span>Photos required</span><span>Quote first</span>
        {activeCount > 0 && <em>{activeCount} active haul{activeCount > 1 ? "s" : ""}</em>}
      </div>
    </section>
  );
}

/* ---------- Requests ---------- */

function RequestsTab({ jobs, notice, onOpen, onNew }: { jobs: Job[]; notice: string; onOpen: (id: string) => void; onNew: () => void }) {
  const current = jobs.filter((job) => job.status !== "completed");
  const past = jobs.filter((job) => job.status === "completed");
  return <section className="sub-page">
    <div className="sub-head"><div><span className="micro-label">YOUR HAULS</span><h2>Requests</h2></div><button className="ghost-button" onClick={onNew}>+ New</button></div>
    {notice && <p className="inline-notice">{notice}</p>}
    <div className="sub-scroll">
      {!jobs.length && <div className="empty-state"><span>▤</span><strong>No requests yet.</strong><small>Start one from Home and it will show up here.</small><button className="hw-primary" onClick={onNew}>Book a haul →</button></div>}
      {current.length > 0 && <>
        <p className="list-label">Current</p>
        {current.map((job) => <JobRow key={job.id} job={job} onOpen={onOpen} />)}
      </>}
      {past.length > 0 && <>
        <p className="list-label">Completed</p>
        {past.map((job) => <JobRow key={job.id} job={job} onOpen={onOpen} />)}
      </>}
    </div>
  </section>;
}

function JobRow({ job, onOpen }: { job: Job; onOpen: (id: string) => void }) {
  return <button className="job-row" onClick={() => onOpen(job.id)}>
    <span className={`status-pill ${job.status}`}>{statusLabel(job.status)}</span>
    <strong>{job.item}</strong>
    <small>{shortDate(job.scheduledDate)} · {job.scheduledTime}</small>
    <b>{job.quoteCents ? money(job.quoteCents) : job.status === "requested" ? "Not approved yet" : "Quote coming"}</b>
    <i aria-hidden="true">→</i>
  </button>;
}

/* ---------- One request: waiting for approval, then chat ---------- */

function RequestView({ jobId, onBack, onChanged }: { jobId: string; onBack: () => void; onChanged: () => Promise<Job[]> }) {
  const [job, setJob] = useState<JobDetails | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" }).then(readJson) as { job: JobDetails };
        if (active) setJob(data.job);
      } catch { /* retry on next poll */ }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [jobId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [job?.messages.length]);

  async function action(actionName: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      const data = await fetch(`/api/jobs/${jobId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, ...extra }) }).then(readJson) as { job: JobDetails };
      setJob(data.job); await onChanged();
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  async function cancel() {
    setBusy(true); setError("");
    try {
      await fetch(`/api/jobs/${jobId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel_request" }) }).then(readJson);
      await onChanged();
      onBack();
    } catch (caught) { setError(errorMessage(caught)); setBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true); setError("");
    try {
      const data = await fetch(`/api/jobs/${jobId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: message }) }).then(readJson) as { job: JobDetails };
      setJob(data.job); setMessage("");
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  if (!job) return <section className="sub-page">
    <div className="sub-head"><button className="back-link" onClick={onBack}>← Requests</button></div>
    <div className="sub-scroll"><div className="skeleton-card" /></div>
  </section>;

  const cancelBlock = confirmCancel
    ? <div className="cancel-confirm">
        <p>Cancel this request? It disappears from your list.</p>
        <div><button onClick={() => setConfirmCancel(false)}>Keep it</button><button className="danger" disabled={busy} onClick={() => void cancel()}>Yes, cancel</button></div>
      </div>
    : <button className="cancel-button" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel request</button>;

  /* Nothing to talk about until a driver takes it — so no chat, no photos, no details. */
  if (job.status === "requested") return <section className="waiting-page">
    <div className="sub-head"><button className="back-link" onClick={onBack}>← Requests</button><span className="status-pill requested">{statusLabel(job.status)}</span></div>
    <div className="waiting-body">
      <span className="waiting-pulse" aria-hidden="true"><i /><i /><i /></span>
      <h2>Waiting to be approved</h2>
      <p>A Haulway driver is reviewing your request. Once it&apos;s accepted, chat opens here and your quote arrives in it.</p>
      <span className="waiting-meta">{job.item} · {shortDate(job.scheduledDate)} · {displayTime(job.scheduledTime)}</span>
    </div>
    {error && <p className="chat-error">{error}</p>}
    <div className="waiting-foot">{cancelBlock}</div>
  </section>;

  return <section className="chat-page">
    <div className="chat-head">
      <button className="chat-back" onClick={onBack} aria-label="Back to requests">←</button>
      <div><strong>{job.item}</strong><small>Haulway · {statusLabel(job.status)}</small></div>
      <span className="chat-live" aria-hidden="true" />
    </div>

    <div className="chat-scroll">
      {job.messages.length === 0 && <p className="chat-hint">A driver accepted your request. Your quote will arrive here.</p>}
      {job.messages.map((entry) => <div key={entry.id} className={`chat-message ${entry.sender}`}>
        <small>{entry.sender === "customer" ? "You" : entry.sender === "operator" ? "Haulway" : "Update"}</small>
        <p>{entry.body}</p>
      </div>)}
      <div ref={endRef} />
    </div>

    <div className="chat-actions">
      {job.status === "quoted" && job.quoteCents != null && <div className="chat-action quote">
        <div><small>YOUR QUOTE</small><strong>{money(job.quoteCents)}</strong></div>
        <div className="chat-action-row">
          <button className="decline-button" disabled={busy} onClick={() => void action("decline_quote")}>Decline</button>
          <button className="hw-primary" disabled={busy} onClick={() => void action("accept_quote")}>Accept</button>
        </div>
      </div>}

      {(job.status === "accepted" || job.status === "in_progress") && !job.paymentMethod && <div className="chat-action">
        <small>HOW WILL YOU PAY?</small>
        <div className="chat-action-row">
          <button className="pay-option" disabled={busy} onClick={() => void action("payment_method", { method: "interac" })}>Interac e-Transfer</button>
          <button className="pay-option" disabled={busy} onClick={() => void action("payment_method", { method: "cash" })}>Cash</button>
        </div>
      </div>}

      {job.paymentMethod && job.status !== "quoted" && <p className="payment-line">
        {job.paymentMethod === "interac" ? "Paying by Interac e-Transfer — Haulway shares the email here." : "Paying with Cash — hand it to the driver on the day."}
        <em className={job.paymentStatus}>{job.paymentStatus === "paid" ? "Received ✓" : "Not marked paid"}</em>
      </p>}

      {job.status === "accepted" && job.paymentMethod && <button className="complete-button" disabled={busy || job.customerConfirmed} onClick={() => void action("confirm_complete")}>{job.customerConfirmed ? "You confirmed completion ✓" : "Confirm job is complete"}</button>}
      {job.status === "completed" && <div className="complete-banner">✓ Job complete</div>}
      {CANCELLABLE.has(job.status) && <div className="chat-cancel">{cancelBlock}</div>}
      {error && <p className="chat-error">{error}</p>}
    </div>

    <form className="chat-composer" onSubmit={send}>
      <input aria-label="Message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message Haulway…" />
      <button disabled={busy || !message.trim()} aria-label="Send">↑</button>
    </form>
  </section>;
}

/* ---------- Request sent ---------- */

function RequestSent({ onDone }: { onDone: () => void }) {
  /* Held in a ref so the parent's 5s job poll re-rendering us never restarts the timer. */
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  return <main className="sent-screen">
    <span className="sent-check" aria-hidden="true"><i /></span>
    <h1>Request sent.</h1>
    <p>A driver will be with you shortly. Your quote lands in Requests once we&apos;ve looked over your photos.</p>
    <button className="hw-primary wide" onClick={() => done.current()}>View my requests<span aria-hidden="true">→</span></button>
  </main>;
}

/* ---------- Boot + auth ---------- */

function Splash() {
  return <main className="splash-screen"><div className="splash-route route-a" /><div className="splash-route route-b" /><Logo light /><h1>Junk gone.<br />Small moves made simple.</h1><span className="splash-loader"><i /></span></main>;
}

function Registration({ onRegistered }: { onRegistered: (customer: Customer) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function register(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const data = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone }) }).then(readJson) as { customer: Customer };
      onRegistered(data.customer);
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  return <main className="auth-screen">
    <div className="auth-top"><Logo /><div className="auth-art" aria-hidden="true"><i /><b>02</b><span>01</span></div></div>
    <form className="auth-sheet" onSubmit={register}>
      <span className="micro-label">WELCOME</span>
      <h1>Clear space.<br /><em>Keep moving.</em></h1>
      <p>Name and number. That&apos;s it.</p>
      <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" /></label>
      <label>Mobile number<span className="phone-field"><span>+1</span><input autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(780) 555-0148" /></span></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="hw-primary wide" disabled={busy}>{busy ? "Saving…" : "Continue →"}</button>
      <small>Your details are saved securely for your requests.</small>
    </form>
  </main>;
}

/* ---------- Request flow ---------- */

function RequestFlow({ service, onCancel, onCreated }: { service: Service; onCancel: () => void; onCreated: () => void | Promise<void> }) {
  const [step, setStep] = useState(1);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(localDate());
  const [time, setTime] = useState("10:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = service === "junk" ? "Junk removal" : "Small move";
  const steps = ["Photos", "Details", "Time"];

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const room = 8 - uploads.length;
    const files = Array.from(event.target.files ?? []).slice(0, room);
    setUploads((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), kind: file.type.startsWith("video/") ? "video" as const : "image" as const }))]);
    setError(""); event.target.value = "";
  }
  function removeFile(upload: Upload) { URL.revokeObjectURL(upload.url); setUploads((current) => current.filter((entry) => entry.id !== upload.id)); }
  function continuePhotos() { if (!uploads.some((entry) => entry.kind === "image")) return setError("Add at least one photo to continue."); setError(""); setStep(2); }

  /* Pickup is the only field the customer must fill. A move still needs somewhere to go. */
  const detailsReady = pickup.trim() && (service !== "move" || dropoff.trim());
  const summaryTitle = description.split("\n").map((line) => line.trim()).find(Boolean) || title;

  async function submit() {
    setBusy(true); setError("");
    let pendingJobId: string | null = null;
    try {
      const data = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType: service, pickup, dropoff, description,
          scheduledDate: date, scheduledTime: time,
          media: uploads.map(({ file }) => ({ filename: file.name, contentType: file.type, sizeBytes: file.size })),
        }),
      }).then(readJson) as {
        jobId: string;
        storage: { url: string; publishableKey: string; bucket: string };
        uploads: Array<{ id: string; path: string; token: string }>;
      };
      pendingJobId = data.jobId;
      const storage = createClient(data.storage.url, data.storage.publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      }).storage.from(data.storage.bucket);
      const results = await Promise.allSettled(uploads.map(async ({ file }, index) => {
        const target = data.uploads[index];
        if (!target) throw new Error("The upload plan is incomplete.");
        const { error: uploadError } = await storage.uploadToSignedUrl(target.path, target.token, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
      }));
      const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failed) throw failed.reason;
      await fetch(`/api/jobs/${data.jobId}/uploads`, { method: "POST" }).then(readJson);
      uploads.forEach((upload) => URL.revokeObjectURL(upload.url));
      await onCreated();
    } catch (caught) {
      if (pendingJobId) void fetch(`/api/jobs/${pendingJobId}/uploads`, { method: "DELETE" });
      setError(errorMessage(caught));
    } finally { setBusy(false); }
  }

  return <div className="flow-shell">
    <header className="flow-bar">
      <button className="flow-back" onClick={() => (step === 1 ? onCancel() : setStep(step - 1))} aria-label="Back">←</button>
      <div className="flow-title"><small>{title}</small><span>Step {step} of 3 · {steps[step - 1]}</span></div>
      <button className="flow-close" onClick={onCancel} aria-label="Cancel">×</button>
    </header>
    <div className="flow-track"><i style={{ width: `${(step / 3) * 100}%` }} /></div>

    <div className="flow-body">
      {step === 1 && <div className="flow-step">
        <h2>Show us what&apos;s moving.</h2>
        <p>At least one photo. Video is welcome.</p>
        <label className={`photo-dropzone ${error ? "error" : ""}`}>
          <input type="file" accept="image/*,video/*" multiple onChange={addFiles} />
          <span className="camera-mark">+</span><strong>Add photos or video</strong><small>Up to 8 files · 25 MB each</small>
        </label>
        {uploads.length > 0 && <div className="photo-grid">
          {uploads.map((upload) => <figure key={upload.id}>
            {upload.kind === "video" ? <video src={upload.url} muted playsInline /> : <img src={upload.url} alt={upload.file.name} />}
            <span className="media-kind">{upload.kind}</span>
            <button onClick={() => removeFile(upload)} aria-label="Remove">×</button>
          </figure>)}
          {uploads.length < 8 && <label className="add-more"><input type="file" accept="image/*,video/*" multiple onChange={addFiles} /><span>+</span><small>More</small></label>}
        </div>}
        {error && <p className="photo-error" role="alert">{error}</p>}
      </div>}

      {step === 2 && <div className="flow-step">
        <h2>Where is it?</h2>
        <p>Only the pickup address is required.</p>
        <div className="compact-form">
          <label>
            <span className="label-row">Pickup<em>Required</em></span>
            <input value={pickup} onChange={(event) => setPickup(event.target.value)} placeholder="Pickup address in Edmonton" />
          </label>
          {service === "move" && <label>
            <span className="label-row">Drop-off<em>Required</em></span>
            <input value={dropoff} onChange={(event) => setDropoff(event.target.value)} placeholder="Drop-off address" />
          </label>}
          <label>
            <span className="label-row">Description &amp; additional info<em className="opt">Optional</em></span>
            <textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={service === "junk"
              ? "Couch, boxes, yard waste… plus stairs, parking, or anything heavy we should know about."
              : "Bed and dresser… plus stairs, elevator, parking, or anything heavy."} />
          </label>
        </div>
      </div>}

      {step === 3 && <div className="flow-step">
        <h2>Pick a time.</h2>
        <p>Choose whatever suits you — we&apos;ll confirm it in chat.</p>
        <div className="compact-form">
          <label><span className="label-row">Preferred date</span><input type="date" min={localDate()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label><span className="label-row">Preferred time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
        </div>
        <div className="mini-summary">
          <span>{uploads.length}</span>
          <div>
            <strong>{summaryTitle}</strong>
            <small>{shortDate(date)} · {displayTime(time)} · {uploads.filter((entry) => entry.kind === "image").length} photo(s){uploads.some((entry) => entry.kind === "video") ? ` · ${uploads.filter((entry) => entry.kind === "video").length} video(s)` : ""}</small>
          </div>
        </div>
        {error && <p className="photo-error" role="alert">{error}</p>}
      </div>}
    </div>

    <div className="flow-foot">
      {step === 1 && <button className="hw-primary wide" onClick={continuePhotos}>Continue<span>→</span></button>}
      {step === 2 && <button className="hw-primary wide" disabled={!detailsReady} onClick={() => setStep(3)}>Continue<span>→</span></button>}
      {step === 3 && <button className="hw-primary wide" disabled={busy} onClick={submit}>{busy ? "Uploading…" : "Send request"}<span>→</span></button>}
    </div>
  </div>;
}

/* ---------- helpers ---------- */

async function readJson(response: Response) {
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }
function wait(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function localDate() { const date = new Date(); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }
function displayTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value.trim() || "—";
  const hours = Number(match[1]);
  if (hours > 23 || Number(match[2]) > 59) return value.trim();
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}
function statusLabel(status: string) { return ({ requested: "Awaiting approval", approved: "Driver accepted", quoted: "Quote ready", accepted: "Booked", in_progress: "In progress", completed: "Complete", cancelled: "Cancelled" } as Record<string, string>)[status] ?? status; }
