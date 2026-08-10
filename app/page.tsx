"use client";

/* eslint-disable @next/next/no-img-element, jsx-a11y/media-has-caption */

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import type { Customer, Job, JobDetails } from "@/lib/contracts";
import { money, shortDate } from "@/lib/contracts";

type Screen = "boot" | "auth" | "home" | "request" | "job";
type Service = "junk" | "move";
type Upload = { id: string; file: File; url: string; kind: "image" | "video" };

function Logo({ light = false }: { light?: boolean }) {
  return <span className={`hw-logo ${light ? "light" : ""}`}><span className="hw-mark">H</span><span>HAULWAY</span></span>;
}

export default function CustomerHome() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobDetails | null>(null);
  const [service, setService] = useState<Service>("junk");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/auth/me", { cache: "no-store" }).then(readJson), wait(900)])
      .then(([data]) => {
        if (!active) return;
        const nextCustomer = (data as { customer: Customer | null }).customer;
        setCustomer(nextCustomer);
        setScreen(nextCustomer ? "home" : "auth");
        if (nextCustomer) void refreshJobs();
      })
      .catch(() => active && setScreen("auth"));
    return () => { active = false; };
  }, []);

  async function refreshJobs() {
    try {
      const data = await fetch("/api/jobs", { cache: "no-store" }).then(readJson) as { jobs: Job[] };
      setJobs(data.jobs);
    } catch {
      setJobs([]);
    }
  }

  async function openJob(id: string) {
    try {
      const data = await fetch(`/api/jobs/${id}`, { cache: "no-store" }).then(readJson) as { job: JobDetails };
      setSelectedJob(data.job);
      setScreen("job");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setCustomer(null);
    setJobs([]);
    setScreen("auth");
  }

  if (screen === "boot") return <Splash />;
  if (screen === "auth") return <Registration onRegistered={(next) => { setCustomer(next); setScreen("home"); void refreshJobs(); }} />;
  if (screen === "request" && customer) {
    return <RequestFlow service={service} customer={customer} onCancel={() => setScreen("home")} onCreated={(job) => {
      setSelectedJob(job);
      setNotice("Request sent. Your quote will appear here.");
      setScreen("job");
      void refreshJobs();
    }} />;
  }
  if (screen === "job" && selectedJob && customer) {
    return <CustomerJobView initialJob={selectedJob} customer={customer} notice={notice} onNotice={setNotice} onSignOut={signOut} onBack={() => { setScreen("home"); setNotice(""); void refreshJobs(); }} />;
  }

  return (
    <main className="customer-app">
      <CustomerHeader customer={customer!} onHome={() => setScreen("home")} onSignOut={signOut} />
      <section className="customer-choice">
        <div className="choice-heading">
          <span className="micro-label">HI {customer?.name.split(" ")[0].toUpperCase()}</span>
          <h1>What needs to move?</h1>
        </div>
        <div className="service-grid">
          <button className="customer-service-card junk" onClick={() => { setService("junk"); setScreen("request"); }}>
            <span className="service-index">01</span><div className="service-art junk-art" aria-hidden="true"><i /><i /><i /></div>
            <div><h2>Junk removal</h2><p>Clear it out.</p></div><span className="service-arrow">→</span>
          </button>
          <button className="customer-service-card move" onClick={() => { setService("move"); setScreen("request"); }}>
            <span className="service-index">02</span><div className="service-art move-art" aria-hidden="true"><i /><i /></div>
            <div><h2>Small-scale moving</h2><p>Move a few things.</p></div><span className="service-arrow">→</span>
          </button>
        </div>
        <div className="choice-footer"><span>Edmonton</span><span>Photos required</span><span>Video allowed</span><span>Quote first</span></div>
      </section>
      <section className="customer-request-list">
        <div className="section-title"><div><span className="micro-label">YOUR REQUESTS</span><h2>Track every haul.</h2></div><button onClick={refreshJobs}>Refresh</button></div>
        {jobs.length ? (
          <div className="request-cards">{jobs.map((job) => <button key={job.id} className="request-card" onClick={() => void openJob(job.id)}>
            <span className={`status-pill ${job.status}`}>{statusLabel(job.status)}</span>
            <strong>{job.item}</strong><small>{shortDate(job.scheduledDate)} · {job.scheduledTime}</small>
            <b>{job.quoteCents ? money(job.quoteCents) : "Quote pending"}</b><i>→</i>
          </button>)}</div>
        ) : <div className="empty-requests"><span>01</span><div><strong>No requests yet.</strong><small>Choose a service above when you are ready.</small></div></div>}
      </section>
      <footer className="customer-footer"><span>Serving all of Edmonton</span><a href="/driver">Operator portal →</a></footer>
    </main>
  );
}

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

  return <main className="auth-shell">
    <section className="auth-brand-panel"><Logo light /><div className="auth-art" aria-hidden="true"><span>01</span><i /><b>02</b></div><h1>Clear space.<br /><em>Keep moving.</em></h1><a href="/driver">Operator portal →</a></section>
    <section className="auth-form-panel"><div className="mobile-auth-logo"><Logo /></div><form className="auth-card" onSubmit={register}>
      <span className="micro-label">WELCOME</span><h2>Let&apos;s get started.</h2><p>Name and number. That&apos;s it.</p>
      <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" /></label>
      <label>Mobile number<div className="phone-field"><span>+1</span><input autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(780) 555-0148" /></div></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="hw-primary wide" disabled={busy}>{busy ? "Saving…" : "Continue →"}</button>
      <small>Your details are saved securely for your requests.</small>
    </form></section>
  </main>;
}

function CustomerHeader({ customer, onHome, onSignOut }: { customer: Customer; onHome: () => void; onSignOut: () => void }) {
  return <header className="customer-header"><button onClick={onHome}><Logo /></button><nav><span>{customer.phone}</span><button onClick={onSignOut}>Sign out</button></nav><span className="customer-avatar">{initials(customer.name)}</span></header>;
}

function RequestFlow({ service, customer, onCancel, onCreated }: { service: Service; customer: Customer; onCancel: () => void; onCreated: (job: JobDetails) => void }) {
  const [step, setStep] = useState(1);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [item, setItem] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(localDate());
  const [time, setTime] = useState("10 AM – 12 PM");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = service === "junk" ? "Junk removal" : "Small move";

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const room = 8 - uploads.length;
    const files = Array.from(event.target.files ?? []).slice(0, room);
    setUploads((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), kind: file.type.startsWith("video/") ? "video" as const : "image" as const }))]);
    setError(""); event.target.value = "";
  }
  function removeFile(upload: Upload) { URL.revokeObjectURL(upload.url); setUploads((current) => current.filter((entry) => entry.id !== upload.id)); }
  function continuePhotos() { if (!uploads.some((entry) => entry.kind === "image")) return setError("Add at least one photo to continue."); setError(""); setStep(2); }

  async function submit() {
    setBusy(true); setError("");
    const form = new FormData();
    form.set("serviceType", service); form.set("item", item); form.set("pickup", pickup); form.set("dropoff", dropoff); form.set("notes", notes); form.set("scheduledDate", date); form.set("scheduledTime", time);
    uploads.forEach(({ file }) => form.append("media", file));
    try {
      const data = await fetch("/api/jobs", { method: "POST", body: form }).then(readJson) as { job: JobDetails };
      uploads.forEach((upload) => URL.revokeObjectURL(upload.url));
      onCreated(data.job);
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  return <main className="request-page">
    <header className="request-header"><button onClick={onCancel}><Logo /></button><span>{customer.name} · {title}</span><button className="request-close" onClick={onCancel}>×</button></header>
    <div className="request-layout"><aside className="request-progress"><span className="micro-label light">NEW REQUEST</span><h1>{title}</h1><ol>
      {["Photos", "Details", "Schedule"].map((label, index) => <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}><span>{step > index + 1 ? "✓" : index + 1}</span>{label}</li>)}
    </ol><div className="photo-rule"><strong>At least one photo required</strong><small>Add multiple photos and videos.</small></div></aside>
    <section className="request-form">
      {step === 1 && <div className="request-step"><span className="micro-label">STEP 1 OF 3</span><h2>Show us what&apos;s moving.</h2><p>Photos are required. Video is welcome.</p>
        <label className={`photo-dropzone ${error ? "error" : ""}`}><input type="file" accept="image/*,video/*" multiple onChange={addFiles} /><span className="camera-mark">+</span><strong>Add photos or video</strong><small>At least one photo · up to 8 files</small></label>
        {uploads.length > 0 && <div className="photo-grid">{uploads.map((upload) => <figure key={upload.id}>{upload.kind === "video" ? <video src={upload.url} muted playsInline /> : <img src={upload.url} alt={upload.file.name} />}<span className="media-kind">{upload.kind}</span><button onClick={() => removeFile(upload)}>×</button></figure>)}{uploads.length < 8 && <label className="add-more"><input type="file" accept="image/*,video/*" multiple onChange={addFiles} /><span>+</span><small>Add more</small></label>}</div>}
        {error && <p className="photo-error" role="alert">{error}</p>}<div className="request-actions"><button className="link-button" onClick={onCancel}>Cancel</button><button className="hw-primary" onClick={continuePhotos}>Continue →</button></div>
      </div>}
      {step === 2 && <div className="request-step"><span className="micro-label">STEP 2 OF 3</span><h2>A few details.</h2><p>Keep it simple.</p><div className="compact-form">
        <label>What is it?<input value={item} onChange={(event) => setItem(event.target.value)} placeholder={service === "junk" ? "Couch, boxes, yard waste…" : "Bed and dresser…"} /></label>
        <label>Pickup<input value={pickup} onChange={(event) => setPickup(event.target.value)} placeholder="Pickup address in Edmonton" /></label>
        {service === "move" && <label>Drop-off<input value={dropoff} onChange={(event) => setDropoff(event.target.value)} placeholder="Drop-off address" /></label>}
        <label>Anything else?<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Stairs, parking, heavy items…" /></label>
      </div><div className="request-actions"><button className="link-button" onClick={() => setStep(1)}>← Back</button><button className="hw-primary" disabled={!item.trim() || !pickup.trim() || (service === "move" && !dropoff.trim())} onClick={() => setStep(3)}>Continue →</button></div></div>}
      {step === 3 && <div className="request-step"><span className="micro-label">STEP 3 OF 3</span><h2>Pick a time.</h2><p>We&apos;ll confirm the final window in chat.</p><div className="compact-form">
        <label>Preferred date<input type="date" min={localDate()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Pickup window<select value={time} onChange={(event) => setTime(event.target.value)}><option>8 AM – 10 AM</option><option>10 AM – 12 PM</option><option>1 PM – 3 PM</option><option>4 PM – 6 PM</option></select></label>
      </div><div className="mini-summary"><span>{uploads.length}</span><div><strong>{item}</strong><small>{uploads.filter((entry) => entry.kind === "image").length} photo(s) · {uploads.filter((entry) => entry.kind === "video").length} video(s)</small></div><b>{title}</b></div>
      {error && <p className="photo-error" role="alert">{error}</p>}<div className="request-actions"><button className="link-button" onClick={() => setStep(2)}>← Back</button><button className="hw-primary" disabled={busy} onClick={submit}>{busy ? "Uploading…" : "Send request →"}</button></div></div>}
    </section></div>
  </main>;
}

function CustomerJobView({ initialJob, customer, notice, onNotice, onSignOut, onBack }: { initialJob: JobDetails; customer: Customer; notice: string; onNotice: (value: string) => void; onSignOut: () => void; onBack: () => void }) {
  const [job, setJob] = useState(initialJob);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await fetch(`/api/jobs/${initialJob.id}`, { cache: "no-store" }).then(readJson) as { job: JobDetails };
        if (active) setJob(data.job);
      } catch { /* retry on next poll */ }
    }
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [initialJob.id]);
  async function action(actionName: string, extra: Record<string, unknown> = {}) { setBusy(true); onNotice(""); try { const data = await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, ...extra }) }).then(readJson) as { job: JobDetails }; setJob(data.job); } catch (caught) { onNotice(errorMessage(caught)); } finally { setBusy(false); } }
  async function sendMessage(event: FormEvent) { event.preventDefault(); if (!message.trim()) return; setBusy(true); try { const data = await fetch(`/api/jobs/${job.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: message }) }).then(readJson) as { job: JobDetails }; setJob(data.job); setMessage(""); } catch (caught) { onNotice(errorMessage(caught)); } finally { setBusy(false); } }

  return <main className="job-page"><CustomerHeader customer={customer} onHome={onBack} onSignOut={onSignOut} /><div className="job-shell">
    <button className="job-back" onClick={onBack}>← All requests</button>{notice && <div className="inline-notice">{notice}</div>}
    <div className="job-heading"><div><span className={`status-pill ${job.status}`}>{statusLabel(job.status)}</span><h1>{job.item}</h1><p>{shortDate(job.scheduledDate)} · {job.scheduledTime}</p></div><span className="job-id">#{job.id.slice(0, 8).toUpperCase()}</span></div>
    <div className="job-columns"><section className="job-overview">
      <div className="job-media">{job.media.map((media) => media.contentType.startsWith("video/") ? <video key={media.id} src={media.url} controls playsInline /> : <img key={media.id} src={media.url} alt={media.filename} />)}</div>
      <div className="job-info-grid"><div><small>PICKUP</small><strong>{job.pickup}</strong></div>{job.dropoff && <div><small>DROP-OFF</small><strong>{job.dropoff}</strong></div>}<div><small>NOTES</small><strong>{job.notes || "No extra notes"}</strong></div></div>
      {job.quoteCents != null && <div className="customer-quote"><div><small>YOUR QUOTE</small><strong>{money(job.quoteCents)}</strong></div>{job.status === "quoted" && <div className="quote-actions"><button className="decline-button" disabled={busy} onClick={() => void action("decline_quote")}>Decline</button><button className="hw-primary" disabled={busy} onClick={() => void action("accept_quote")}>Accept quote</button></div>}</div>}
      {(job.status === "accepted" || job.status === "in_progress" || job.status === "completed") && <div className="payment-choice"><span className="micro-label">PAYMENT</span><h3>{job.paymentMethod ? `Pay by ${job.paymentMethod === "interac" ? "Interac e-Transfer" : "cash"}` : "How will you pay?"}</h3><p>{job.paymentMethod === "interac" ? "We’ll send the Interac email in chat." : job.paymentMethod === "cash" ? "Pay the operator directly in cash." : "No online payment is collected."}</p>{!job.paymentMethod && <div><button disabled={busy} onClick={() => void action("payment_method", { method: "interac" })}>Interac</button><button disabled={busy} onClick={() => void action("payment_method", { method: "cash" })}>Cash</button></div>}<span className={`payment-state ${job.paymentStatus}`}>{job.paymentStatus === "paid" ? "Payment received" : "Not marked paid"}</span></div>}
      {job.status !== "completed" && job.status === "accepted" && <button className="complete-button" disabled={busy || job.customerConfirmed} onClick={() => void action("confirm_complete")}>{job.customerConfirmed ? "You confirmed completion ✓" : "Confirm job is complete"}</button>}
      {job.status === "completed" && <div className="complete-banner">✓ Job complete</div>}
    </section>
    <ChatPanel messages={job.messages} value={message} setValue={setMessage} onSubmit={sendMessage} busy={busy} />
    </div>
  </div></main>;
}

function ChatPanel({ messages, value, setValue, onSubmit, busy }: { messages: JobDetails["messages"]; value: string; setValue: (value: string) => void; onSubmit: (event: FormEvent) => void; busy: boolean }) {
  return <aside className="chat-panel"><header><span className="micro-label">CHAT</span><h2>Haulway</h2></header><div className="chat-messages">{messages.map((entry) => <div key={entry.id} className={`chat-message ${entry.sender}`}><small>{entry.sender === "customer" ? "You" : entry.sender === "operator" ? "Haulway" : "Update"}</small><p>{entry.body}</p></div>)}</div><form onSubmit={onSubmit}><input aria-label="Message" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Write a message…" /><button disabled={busy || !value.trim()}>Send</button></form></aside>;
}

async function readJson(response: Response) {
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }
function wait(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function localDate() { const date = new Date(); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }
function statusLabel(status: string) { return ({ requested: "Quote pending", quoted: "Quote ready", accepted: "Booked", in_progress: "In progress", completed: "Complete" } as Record<string, string>)[status] ?? status; }
