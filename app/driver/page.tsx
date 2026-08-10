"use client";

/* eslint-disable @next/next/no-img-element, jsx-a11y/media-has-caption */

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Job, JobDetails } from "@/lib/contracts";
import { money, shortDate } from "@/lib/contracts";

type Gate = "boot" | "setup" | "login" | "dashboard";

function DriverLogo() {
  return <span className="driver-logo"><span>H</span><b>HAULWAY</b><small>OPERATOR</small></span>;
}

export default function DriverPortal() {
  const [gate, setGate] = useState<Gate>("boot");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobDetails | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/operator/session", { cache: "no-store" }).then(readJson).then((data) => {
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
        if (!active) return;
        setJobs(data.jobs);
        const target = selectedId ?? data.jobs[0]?.id;
        if (target) {
          const detail = await operatorFetch(`/api/jobs/${target}`) as { job: JobDetails };
          if (active) { setSelectedId(target); setSelectedJob(detail.job); }
        } else if (active) setSelectedJob(null);
      } catch (caught) { if (active) setError(errorMessage(caught)); }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [gate, selectedId]);

  async function loadJobs(selectFirst = true) {
    try {
      const data = await operatorFetch("/api/jobs") as { jobs: Job[] };
      setJobs(data.jobs);
      const target = selectedId ?? (selectFirst ? data.jobs[0]?.id : null);
      if (target) { setSelectedId(target); await loadJob(target); }
      else setSelectedJob(null);
    } catch (caught) { setError(errorMessage(caught)); }
  }

  async function loadJob(id: string) {
    try {
      const data = await operatorFetch(`/api/jobs/${id}`) as { job: JobDetails };
      setSelectedJob(data.job);
    } catch (caught) { setError(errorMessage(caught)); }
  }

  async function selectJob(id: string) { setSelectedId(id); await loadJob(id); }
  async function logout() { await fetch("/api/operator/logout", { method: "POST" }); setJobs([]); setSelectedJob(null); setGate("login"); }

  if (gate === "boot") return <main className="driver-login-page"><div className="operator-loader"><DriverLogo /><span /></div></main>;
  if (gate === "setup" || gate === "login") return <OperatorGate mode={gate} error={error} onError={setError} onSuccess={() => { setError(""); setGate("dashboard"); }} />;

  const activeCount = jobs.filter((job) => job.status !== "completed" && job.status !== "cancelled").length;
  const quotedCount = jobs.filter((job) => job.status === "quoted").length;
  const completedCount = jobs.filter((job) => job.status === "completed").length;
  return <main className="driver-portal">
    <aside className="driver-sidebar"><DriverLogo /><nav><button className="active"><span>⌂</span>Requests <i>{activeCount}</i></button><Link href="/"><span>↗</span>Customer site</Link></nav><div className="driver-profile"><span>HW</span><div><strong>Haulway</strong><small>Operator</small></div><button aria-label="Sign out" onClick={logout}>↪</button></div></aside>
    <section className="driver-main"><header><div><span className="micro-label">CUSTOMER REQUESTS</span><h1>Your work, in one place.</h1></div><div className="online-switch"><i /><span><strong>Open</strong><small>Edmonton</small></span></div></header>
      <div className="driver-metrics"><div><small>ACTIVE</small><strong>{activeCount}</strong></div><div><small>QUOTES OUT</small><strong>{quotedCount}</strong></div><div><small>COMPLETED</small><strong>{completedCount}</strong></div></div>
      {error && <div className="driver-inline-error">{error}<button onClick={() => setError("")}>×</button></div>}
      <div className="driver-board"><div className="driver-list"><div className="driver-list-head"><strong>Requests</strong><button onClick={() => void loadJobs()}>Refresh</button></div>
        {jobs.length ? jobs.map((job) => <button key={job.id} className={`driver-job ${selectedId === job.id ? "active" : ""}`} onClick={() => void selectJob(job.id)}><span>{statusLabel(job.status)}</span><strong>{job.item}</strong><small>{job.customer.name} · {job.pickup}</small><div><b>{shortDate(job.scheduledDate)}</b><em>{job.quoteCents ? money(job.quoteCents) : "Needs quote"}</em></div></button>) : <div className="driver-empty"><span>✓</span><strong>No customer requests yet.</strong><small>New requests will appear here automatically.</small></div>}
      </div>{selectedJob ? <OperatorJob key={`${selectedJob.id}-${selectedJob.quoteCents ?? "none"}`} job={selectedJob} onChange={(next) => { setSelectedJob(next); void loadJobs(false); }} onError={setError} /> : <div className="driver-detail driver-detail-empty"><span>H</span><h2>Ready for the next job.</h2><p>Customer details, uploads, quotes, and chat will appear here.</p></div>}</div>
    </section>
  </main>;
}

function OperatorGate({ mode, error, onError, onSuccess }: { mode: "setup" | "login"; error: string; onError: (error: string) => void; onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); onError("");
    if (!/^\d{6}$/.test(pin)) return onError("Enter a 6-digit PIN.");
    if (mode === "setup" && pin !== confirm) return onError("The PINs do not match.");
    setBusy(true);
    try { await fetch(`/api/operator/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) }).then(readJson); onSuccess(); }
    catch (caught) { onError(errorMessage(caught)); } finally { setBusy(false); }
  }
  return <main className="driver-login-page"><header><Link href="/"><DriverLogo /></Link><Link href="/">Customer site →</Link></header><form className="driver-login-card" onSubmit={submit}><span className="driver-login-icon">H</span><span className="micro-label light">{mode === "setup" ? "FIRST-TIME SETUP" : "OPERATOR SIGN IN"}</span><h1>{mode === "setup" ? "Secure your portal." : "Welcome back."}</h1><p>{mode === "setup" ? "Create the private PIN you’ll use to manage Haulway jobs." : "Enter your private operator PIN."}</p>
    <label>{mode === "setup" ? "Create a 6-digit PIN" : "6-digit PIN"}<input className="driver-code" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} placeholder="••••••" /></label>
    {mode === "setup" && <label>Confirm PIN<input className="driver-code" type="password" inputMode="numeric" maxLength={6} value={confirm} onChange={(event) => setConfirm(event.target.value.replace(/\D/g, ""))} placeholder="••••••" /></label>}
    {error && <p className="driver-error">{error}</p>}<button disabled={busy}>{busy ? "Please wait…" : mode === "setup" ? "Create operator account →" : "Sign in →"}</button>{mode === "setup" && <small className="operator-warning">Do this before sharing the customer website.</small>}
  </form><footer>Haulway Operator · Edmonton</footer></main>;
}

function OperatorJob({ job, onChange, onError }: { job: JobDetails; onChange: (job: JobDetails) => void; onError: (message: string) => void }) {
  const [quote, setQuote] = useState(job.quoteCents ? String(job.quoteCents / 100) : "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function action(actionName: string, extra: Record<string, unknown> = {}) {
    setBusy(true); onError("");
    try { const data = await operatorFetch(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ action: actionName, ...extra }) }) as { job: JobDetails }; onChange(data.job); }
    catch (caught) { onError(errorMessage(caught)); } finally { setBusy(false); }
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault(); if (!message.trim()) return; setBusy(true);
    try { const data = await operatorFetch(`/api/jobs/${job.id}/messages`, { method: "POST", body: JSON.stringify({ body: message }) }) as { job: JobDetails }; onChange(data.job); setMessage(""); }
    catch (caught) { onError(errorMessage(caught)); } finally { setBusy(false); }
  }

  const mediaUrls = useMemo(() => job.media.map((media) => ({ ...media, operatorUrl: `${media.url}?role=operator` })), [job.media]);
  return <article className="driver-detail"><div className="driver-detail-head"><div><span>{statusLabel(job.status)}</span><h2>{job.item}</h2><p>{job.customer.name} · <a href={`tel:${job.customer.phone}`}>{job.customer.phone}</a></p></div><b>#{job.id.slice(0, 8).toUpperCase()}</b></div>
    <div className="driver-photo-strip">{mediaUrls.map((media) => media.contentType.startsWith("video/") ? <video key={media.id} src={media.operatorUrl} controls playsInline /> : <img key={media.id} src={media.operatorUrl} alt={media.filename} />)}</div>
    <div className="driver-route"><div><i>A</i><span><small>PICKUP</small><strong>{job.pickup}</strong></span></div>{job.dropoff && <><em>TO</em><div><i>B</i><span><small>DROP-OFF</small><strong>{job.dropoff}</strong></span></div></>}</div>
    <div className="driver-note"><small>CUSTOMER NOTE</small><p>{job.notes || "No extra notes."}</p><b>{shortDate(job.scheduledDate)} · {job.scheduledTime}</b></div>
    <div className="operator-chat"><header><span className="micro-label">CHAT</span><small>Share your Interac email here when needed.</small></header><div className="chat-messages">{job.messages.map((entry) => <div key={entry.id} className={`chat-message ${entry.sender}`}><small>{entry.sender === "operator" ? "You" : entry.sender === "customer" ? job.customer.name : "Update"}</small><p>{entry.body}</p></div>)}</div><form onSubmit={sendMessage}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message customer…" /><button disabled={busy || !message.trim()}>Send</button></form></div>
    {job.status === "requested"
      ? <button className="operator-accept" disabled={busy} onClick={() => void action("approve_request")}>Accept this request →</button>
      : job.status === "cancelled"
        ? <div className="operator-cancelled">Cancelled by the customer</div>
        : <div className="quote-bar"><div><small>{job.quoteCents ? "CURRENT QUOTE" : "SEND A QUOTE"}</small><label>$<input inputMode="decimal" value={quote} onChange={(event) => setQuote(event.target.value.replace(/[^\d.]/g, ""))} /></label></div><button disabled={busy || !quote} onClick={() => void action("send_quote", { amount: Number(quote) })}>{job.quoteCents ? "Update quote →" : "Send quote →"}</button></div>}
    {job.paymentMethod && <div className="operator-payment"><div><small>PAYMENT</small><strong>{job.paymentMethod === "interac" ? "Interac e-Transfer" : "Cash"}</strong><span>{job.paymentStatus === "paid" ? "Received ✓" : "Waiting"}</span></div>{job.paymentStatus !== "paid" && <button disabled={busy} onClick={() => void action("mark_paid")}>Mark paid</button>}</div>}
    {job.status === "accepted" && <button className="operator-complete" disabled={busy || job.operatorConfirmed} onClick={() => void action("confirm_complete")}>{job.operatorConfirmed ? "You confirmed completion ✓" : "Confirm job complete"}</button>}
    {job.status === "completed" && <div className="complete-banner">✓ Confirmed complete by both sides</div>}
  </article>;
}

async function operatorFetch(input: string, init: RequestInit = {}) {
  const response = await fetch(input, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", "x-haulway-role": "operator", ...init.headers } });
  return readJson(response);
}
async function readJson(response: Response) { const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "Something went wrong."); return data; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }
function statusLabel(status: string) { return ({ requested: "Needs approval", approved: "Accepted — needs quote", quoted: "Quote sent", accepted: "Booked", in_progress: "In progress", completed: "Complete", cancelled: "Cancelled" } as Record<string, string>)[status] ?? status; }
