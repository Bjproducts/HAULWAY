"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, CSSProperties, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Customer, Job, JobDetails } from "@/lib/contracts";
import { BUILDING_TYPES, INTERAC_EMAIL, MAX_OPEN_REQUESTS, NEEDS_UNIT, STAIRS_OPTIONS, money, shortDate } from "@/lib/contracts";
import { Composer, MessageList, useStickyScroll } from "./chat-ui";

type Screen = "boot" | "auth" | "app" | "request";
type Tab = "home" | "requests";
type Service = "junk" | "move";
type Upload = { id: string; file: File; url: string; kind: "image" | "video" };
type InAppUpdate = { id: number; jobId: string; title: string; detail: string; icon: string };

/* A customer can back out until they have accepted a quote — mirrors the API guard. */
const CANCELLABLE = new Set(["requested", "approved", "quoted"]);
const FINISHED = new Set(["completed", "cancelled"]);

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
  const [updates, setUpdates] = useState<InAppUpdate[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [otpRequired, setOtpRequired] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(readDraft);
  /* Lazy initialiser: readSeen guards its own storage access, so it safely returns
     {} during SSR and the real map on the client. */
  const [seen, setSeen] = useState<Record<string, number>>(readSeen);

  /* A snapshot makes polling feel event-driven: only changes since the last
     successful refresh become notifications, never the initial page load. */
  const jobSnapshot = useRef<Map<string, Job> | null>(null);
  const updateId = useRef(0);
  const nav = useRef({ screen, tab, openJobId });
  useEffect(() => { nav.current = { screen, tab, openJobId }; }, [screen, tab, openJobId]);

  const refreshJobs = useCallback(async (silentJobId?: string) => {
    try {
      const data = await fetch("/api/jobs", { cache: "no-store" }).then(readJson) as { jobs: Job[] };
      const previous = jobSnapshot.current;
      if (previous) {
        const changed = data.jobs.flatMap((job) => {
          const before = previous.get(job.id);
          /* Customer-initiated actions refresh the list too, but should not
             announce the customer's own tap back as a new external update. */
          const copy = before && job.id !== silentJobId ? describeJobUpdate(before, job) : null;
          return copy ? [{ ...copy, id: ++updateId.current, jobId: job.id }] : [];
        });
        if (changed.length) setUpdates((current) => [...current, ...changed].slice(-3));

        /* A fast driver may accept and quote between two polls, so any move out
           of "requested" counts as accepted and opens the live tracking view. */
        const claimed = data.jobs.find((job) => {
          const before = previous.get(job.id);
          return before?.status === "requested" && job.status !== "requested" && job.status !== "cancelled";
        });
        if (claimed) {
          const currentView = nav.current;
          const alreadyOpen = currentView.screen === "app" && currentView.tab === "requests" && currentView.openJobId === claimed.id;
          if (!alreadyOpen) {
            setScreen("app");
            setTab("requests");
            setOpenJobId(claimed.id);
            history.pushState({ hw: true }, "");
          }
        }
      }
      jobSnapshot.current = new Map(data.jobs.map((job) => [job.id, job]));
      setJobs(data.jobs);
      return data.jobs;
    } catch {
      return [] as Job[];
    }
  }, []);

  useEffect(() => {
    let active = true;
    /* The splash is a first-impression, not a toll booth — returning visitors in the
       same session skip straight past it. */
    const returning = sessionStorage.getItem("hw_splash") === "1";
    Promise.all([fetch("/api/auth/me", { cache: "no-store" }).then(readJson), wait(returning ? 0 : 1500)])
      .then(([data]) => {
        if (!active) return;
        sessionStorage.setItem("hw_splash", "1");
        const payload = data as { customer: Customer | null; otpRequired?: boolean };
        const next = payload.customer;
        setOtpRequired(payload.otpRequired !== false);
        setCustomer(next);
        setScreen(next ? "app" : "auth");
        if (next) void refreshJobs();
      })
      .catch(() => active && setScreen("auth"));
    return () => { active = false; };
  }, [refreshJobs]);

  /* Android back / browser back should step back through the app, not leave it. */
  useEffect(() => {
    function onPop() {
      const { screen: s, tab: t, openJobId: j } = nav.current;
      /* Leaving the booking flow: pick up whatever it saved so Home can offer a resume. */
      if (s === "request") { setScreen("app"); setDraft(readDraft()); return; }
      if (j) { setOpenJobId(null); setNotice(""); return; }
      if (t !== "home") { setTab("home"); return; }
      history.back();
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    /* Keep listening while a signed-in customer is in the booking flow too. If
       another haul is accepted, tracking takes priority and the draft remains saved. */
    if (!customer) return;
    const timer = window.setInterval(() => void refreshJobs(), 5000);
    return () => window.clearInterval(timer);
  }, [customer, refreshJobs]);

  async function signOut() {
    setAccountOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    setCustomer(null); setJobs([]); setOpenJobId(null);
    jobSnapshot.current = null; setUpdates([]);
    setTab("home"); setScreen("auth");
  }

  function goTab(next: Tab) {
    setTab(next); setNotice("");
    if (next !== "requests") setOpenJobId(null);
  }

  /* Every push is matched by a history entry, so in-app back and hardware back
     stay in step — the back buttons just call history.back(). */
  function goDeeper() { history.pushState({ hw: true }, ""); }

  function openJob(id: string) {
    setOpenJobId(id);
    goDeeper();
  }

  function openUpdate(update: InAppUpdate) {
    setUpdates((current) => current.filter((entry) => entry.id !== update.id));
    setScreen("app"); setTab("requests");
    if (nav.current.openJobId !== update.jobId) {
      setOpenJobId(update.jobId);
      goDeeper();
    }
  }

  const dismissUpdate = useCallback((id: number) => {
    setUpdates((current) => current.filter((entry) => entry.id !== id));
  }, []);

  function markSeen(id: string, count: number) {
    setSeen((previous) => {
      const next = { ...previous, [id]: count };
      writeSeen(next);
      return next;
    });
  }

  const unread = (job: Job) => (job.messageCount ?? 0) > (seen[job.id] ?? 0);

  if (screen === "boot") return <Splash />;
  if (screen === "auth") return <Registration otpRequired={otpRequired} onRegistered={(next) => { setCustomer(next); setScreen("app"); void refreshJobs(); }} />;
  if (screen === "request" && customer) {
    return <RequestFlow
      service={service}
      draft={draft && draft.service === service ? draft : null}
      onCancel={() => history.back()}
      /* Straight onto the haul they just booked. Showing the whole list here made
         them hunt for the thing they created one second ago, and a separate
         "request sent" screen only repeated what this page already says. */
      onCreated={async (jobId) => {
        clearDraft(); setDraft(null);
        setNotice("Booked. We're finding you a driver.");
        setTab("requests"); setOpenJobId(jobId); setScreen("app");
        await refreshJobs();
      }}
    />;
  }
  if (!customer) return <Splash />;

  const openRequests = jobs.filter((job) => job.status === "requested").length;

  return (
    <div className="app-shell">
      <header className="app-bar">
        <button className="app-bar-logo" onClick={() => goTab("home")} aria-label="Haulway home"><Logo /></button>
        <span className="head-menu">
          <button className="app-avatar" onClick={() => setAccountOpen((value) => !value)} aria-label="Your account" aria-expanded={accountOpen}>{initials(customer.name)}</button>
          {accountOpen && <>
            <button className="menu-scrim" aria-label="Close menu" onClick={() => setAccountOpen(false)} />
            <span className="menu-pop account">
              <span className="menu-who"><strong>{customer.name}</strong><small>{customer.phone}</small></span>
              <button onClick={() => void signOut()}>Sign out</button>
            </span>
          </>}
        </span>
      </header>

      <div className="notification-stack" aria-live="polite" aria-label="Request updates">
        {updates.map((update) => <UpdateToast key={update.id} update={update} onOpen={openUpdate} onDismiss={dismissUpdate} />)}
      </div>

      <main className="app-body">
        {tab === "home" && <HomeTab
          customer={customer}
          activeCount={jobs.filter((job) => !FINISHED.has(job.status)).length}
          openRequests={openRequests}
          draft={draft}
          onDiscardDraft={() => { clearDraft(); setDraft(null); }}
          onRequests={() => goTab("requests")}
          onPick={(picked) => {
            /* Choosing a different service is a fresh start — the old draft goes. */
            if (draft && draft.service !== picked) { clearDraft(); setDraft(null); }
            setService(picked); setScreen("request"); goDeeper();
          }}
        />}
        {/* Opening a request shows either "waiting to be approved" or its chat. */}
        {tab === "requests" && (openJobId
          ? <RequestView key={openJobId} jobId={openJobId} banner={notice} seenCount={seen[openJobId] ?? 0} onBack={() => history.back()} onChanged={refreshJobs} onSeen={markSeen} />
          : <RequestsTab jobs={jobs} notice={notice} unread={unread} onOpen={openJob} onNew={() => goTab("home")} />)}
      </main>

      <nav className="tab-bar">
        <TabButton icon="⌂" label="Home" active={tab === "home"} onClick={() => goTab("home")} />
        <TabButton icon="▤" label="Requests" active={tab === "requests"} badge={jobs.filter((job) => !FINISHED.has(job.status)).length} onClick={() => goTab("requests")} />
      </nav>
    </div>
  );
}

function UpdateToast({ update, onOpen, onDismiss }: { update: InAppUpdate; onOpen: (update: InAppUpdate) => void; onDismiss: (id: number) => void }) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss.current(update.id), 1000);
    return () => window.clearTimeout(timer);
  }, [update.id]);

  return <article className="update-toast">
    <button className="update-toast-open" onClick={() => onOpen(update)}>
      <span className="update-toast-icon" aria-hidden="true">{update.icon}</span>
      <span><strong>{update.title}</strong><small>{update.detail}</small></span>
      <i aria-hidden="true">→</i>
    </button>
    <button className="update-toast-dismiss" onClick={() => onDismiss(update.id)} aria-label={`Dismiss ${update.title}`}>×</button>
  </article>;
}

function TabButton({ icon, label, active, badge = 0, onClick }: { icon: string; label: string; active: boolean; badge?: number; onClick: () => void }) {
  return <button className={`tab-button ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
    <span className="tab-icon">{icon}{badge > 0 && <i>{badge}</i>}</span>{label}
  </button>;
}

/* ---------- Home ---------- */

function HomeTab({ customer, activeCount, openRequests, draft, onDiscardDraft, onRequests, onPick }: { customer: Customer; activeCount: number; openRequests: number; draft: Draft | null; onDiscardDraft: () => void; onRequests: () => void; onPick: (service: Service) => void }) {
  const atLimit = openRequests >= MAX_OPEN_REQUESTS;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (atLimit) return;
    const timer = window.setTimeout(() => setOpen(true), 1100);
    return () => window.clearTimeout(timer);
  }, [atLimit]);

  return (
    <section className="home-tab">
      <div className="home-greeting">
        <span className="micro-label enter" style={{ animationDelay: ".05s" }}>HI {customer.name.split(" ")[0].toUpperCase()}</span>
        <h1>
          {atLimit ? <>
            <span className="enter" style={{ animationDelay: ".18s" }}>Two hauls are</span>
            <span className="enter accent" style={{ animationDelay: ".30s" }}>already in motion.</span>
          </> : <>
            <span className="enter" style={{ animationDelay: ".18s" }}>Ohh, what can</span>
            <span className="enter" style={{ animationDelay: ".30s" }}>we help you</span>
            <span className="enter accent" style={{ animationDelay: ".42s" }}>with today?</span>
          </>}
        </h1>
      </div>

      {activeCount > 0 && <button className="live-haul-strip enter" style={{ animationDelay: ".46s" }} onClick={onRequests}>
        <span className="live-haul-pulse" aria-hidden="true" />
        <span><strong>{activeCount} active haul{activeCount > 1 ? "s" : ""}</strong><small>Live tracking and updates</small></span>
        <i aria-hidden="true">→</i>
      </button>}

      {draft && !atLimit && <div className="draft-strip enter" style={{ animationDelay: ".5s" }}>
        <button className="draft-resume" onClick={() => onPick(draft.service)}>
          <span className="draft-icon" aria-hidden="true">✎</span>
          <span><strong>Finish your {draft.service === "junk" ? "junk removal" : "small move"}</strong><small>Your details are saved</small></span>
          <i aria-hidden="true">→</i>
        </button>
        <button className="draft-discard" onClick={onDiscardDraft} aria-label="Discard saved draft">×</button>
      </div>}

      {atLimit ? <div className="limit-card enter" style={{ animationDelay: ".5s" }}>
        <span className="limit-icon" aria-hidden="true">🚚</span>
        <strong>You&apos;re at the {MAX_OPEN_REQUESTS}-haul limit</strong>
        <small>Both are still waiting for a driver. As soon as one gets picked up, you can book the next.</small>
      </div> : <div className={`service-picker enter ${open ? "open" : ""}`} style={{ animationDelay: ".58s" }}>
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
      </div>}

      <div className="home-foot enter" style={{ animationDelay: ".72s" }}>
        <span>Edmonton</span><span>Photos required</span><span>Quote first</span>
        {activeCount > 0 && <em>{activeCount} active haul{activeCount > 1 ? "s" : ""}</em>}
      </div>
    </section>
  );
}

/* ---------- Requests ---------- */

function RequestsTab({ jobs, notice, unread, onOpen, onNew }: { jobs: Job[]; notice: string; unread: (job: Job) => boolean; onOpen: (id: string) => void; onNew: () => void }) {
  const current = jobs.filter((job) => !FINISHED.has(job.status));
  const past = jobs.filter((job) => FINISHED.has(job.status));
  return <section className="sub-page">
    <div className="sub-head"><div><span className="micro-label">YOUR HAULS</span><h2>Requests</h2></div><button className="ghost-button" onClick={onNew}>+ New</button></div>
    {notice && <p className="inline-notice">{notice}</p>}
    <div className="sub-scroll">
      {!jobs.length && <div className="empty-state"><span>▤</span><strong>No requests yet.</strong><small>Start one from Home and it will show up here.</small><button className="hw-primary" onClick={onNew}>Book a haul →</button></div>}
      {current.length > 0 && <>
        <p className="list-label">Current</p>
        {current.map((job) => <JobRow key={job.id} job={job} unread={unread(job)} onOpen={onOpen} />)}
      </>}
      {past.length > 0 && <>
        <p className="list-label">Completed</p>
        {past.map((job) => <JobRow key={job.id} job={job} unread={unread(job)} onOpen={onOpen} />)}
      </>}
    </div>
  </section>;
}

function JobRow({ job, unread, onOpen }: { job: Job; unread: boolean; onOpen: (id: string) => void }) {
  return <button className={`job-row ${unread ? "unread" : ""}`} onClick={() => onOpen(job.id)}>
    <span className="job-row-top">
      <span className={`status-pill ${job.status}`}>{statusLabel(job.status)}</span>
      {unread && <span className="new-dot">New</span>}
    </span>
    <strong>{job.item}</strong>
    <small>{shortDate(job.scheduledDate)} · {job.scheduledTime}</small>
    <span className="job-row-location">{job.pickup}{job.dropoff ? ` → ${job.dropoff}` : ""}</span>
    <b>{job.quoteCents ? money(job.quoteCents) : job.status === "requested" ? "Waiting on a driver" : "Quote coming"}</b>
    <i aria-hidden="true">→</i>
  </button>;
}

function JobJourney({ status }: { status: string }) {
  const stages = ["Requested", "Driver found", "Quote", "Haul booked", "Complete"];
  const reached = status === "requested" ? 1 : status === "approved" ? 2 : status === "quoted" ? 3 : status === "accepted" || status === "in_progress" ? 4 : 5;
  return <ol className="job-journey" aria-label={`Haul progress: ${stages[Math.min(reached - 1, stages.length - 1)]}`}>
    {stages.map((stage, index) => {
      const done = index < reached;
      return <li key={stage} className={done ? "done" : index === reached ? "active" : ""}>
        <i aria-hidden="true">{done ? "✓" : index + 1}</i><span>{stage}</span>
      </li>;
    })}
  </ol>;
}

/* ---------- One request: waiting for approval, then chat ---------- */

function RequestView({ jobId, banner, seenCount, onBack, onChanged, onSeen }: { jobId: string; banner?: string; seenCount: number; onBack: () => void; onChanged: (silentJobId?: string) => Promise<Job[]>; onSeen: (id: string, count: number) => void }) {
  const [job, setJob] = useState<JobDetails | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /* Tracking is the request's home. Chat stays one intentional tap away so the
     most important answer — what is happening and when — always comes first. */
  const [showChat, setShowChat] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const { ref: chatScrollRef, pinned: chatPinned, jump: jumpToLatest } = useStickyScroll((job?.messages.length ?? 0) + pending.length);

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

  /* Only opening the optional conversation marks it read. Viewing live tracking
     should not silently clear a message the customer has not actually seen. */
  const seenRef = useRef(onSeen);
  useEffect(() => { seenRef.current = onSeen; }, [onSeen]);
  useEffect(() => { if (showChat && job) seenRef.current(jobId, job.messages.length); }, [jobId, job, showChat]);

  async function action(actionName: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      const data = await fetch(`/api/jobs/${jobId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, ...extra }) }).then(readJson) as { job: JobDetails };
      setJob(data.job); await onChanged(jobId);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally { setBusy(false); }
  }

  async function cancel() {
    setBusy(true); setError("");
    try {
      await fetch(`/api/jobs/${jobId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel_request" }) }).then(readJson);
      await onChanged(jobId);
      onBack();
    } catch (caught) { setError(errorMessage(caught)); setBusy(false); }
  }

  /* The bubble appears the moment you hit send; the network catches up behind it.
     If the send fails the text comes back so nothing is silently lost. */
  async function send(event: FormEvent) {
    event.preventDefault();
    const body = message.trim();
    if (!body) return;
    setMessage(""); setError("");
    setPending((queue) => [...queue, body]);
    try {
      const data = await fetch(`/api/jobs/${jobId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }).then(readJson) as { job: JobDetails };
      setJob(data.job);
      await onChanged(jobId);
    } catch (caught) {
      setError(errorMessage(caught));
      setMessage((current) => current || body);
    } finally {
      setPending((queue) => queue.slice(1));
    }
  }

  if (!job) return <section className="sub-page">
    <div className="sub-head"><button className="back-link" onClick={onBack}>← Requests</button></div>
    <div className="sub-scroll"><div className="skeleton-card" /></div>
  </section>;

  const cancelSheet = confirmCancel && <div className="cancel-sheet" role="dialog" aria-modal="true">
    <div className="cancel-sheet-card">
      <h3>Cancel this request?</h3>
      <p>It disappears from your requests and the driver is told.</p>
      <div><button disabled={busy} onClick={() => setConfirmCancel(false)}>Keep it</button><button className="danger" disabled={busy} onClick={() => void cancel()}>Yes, cancel</button></div>
    </div>
  </div>;

  /* Nothing to talk about until a driver takes it — so no chat, no photos, no details. */
  if (job.status === "requested") return <section className="waiting-page">
    <div className="sub-head"><button className="back-link" onClick={onBack}>← Requests</button><span className="status-pill requested">{statusLabel(job.status)}</span></div>
    <div className="waiting-body">
      {banner && <p className="booked-banner" role="status">✓ {banner}</p>}
      <span className="radar" aria-hidden="true"><i /><i /><i /><b>🚚</b></span>
      <JobJourney status={job.status} />
      <h2>Looking for a driver</h2>
      <p>We&apos;re finding a Haulway driver for this haul. You&apos;ll get a notification the moment one takes it.</p>
      <span className="waiting-meta">{job.item} · {shortDate(job.scheduledDate)} · {displayTime(job.scheduledTime)}</span>
      <span className="waiting-assurance"><i aria-hidden="true" />You can leave this screen—we&apos;ll bring you back.</span>
    </div>
    {error && <p className="chat-error">{error}</p>}
    <div className="waiting-foot"><button className="cancel-button" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel request</button></div>
    {cancelSheet}
  </section>;

  const newMessages = Math.max(0, job.messages.length - seenCount);

  /* Chat is a secondary destination. Back returns to live tracking instead of
     leaving the request, which keeps the user's place in the journey. */
  if (showChat) return <section className="chat-page optional-chat">
    <div className="chat-head">
      <button className="chat-back" onClick={() => setShowChat(false)} aria-label="Back to live tracking">←</button>
      <div><strong>Message Haulway</strong><small>{job.item} · Replies and updates</small></div>
      {CANCELLABLE.has(job.status)
        ? <span className="head-menu">
            <button className="menu-dots" onClick={() => setMenuOpen((value) => !value)} aria-label="Request options" aria-expanded={menuOpen}>⋮</button>
            {menuOpen && <>
              <button className="menu-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
              <span className="menu-pop"><button onClick={() => { setMenuOpen(false); setConfirmCancel(true); }}>Cancel request</button></span>
            </>}
          </span>
        : <span className="chat-live" aria-hidden="true" />}
    </div>

    <div className="chat-scroll" ref={chatScrollRef} role="log" aria-live="polite" aria-label="Conversation with Haulway">
      {!job.messages.length && !pending.length && <p className="chat-hint">Chat is here when you need it. Ask about access, timing, or anything your driver should know.</p>}
      <MessageList messages={job.messages} mine="customer" nameFor={(sender) => sender === "customer" ? "You" : "Haulway"} pending={pending} />
    </div>
    {!chatPinned && <button className="jump-latest" onClick={jumpToLatest}>Latest<span aria-hidden="true">↓</span></button>}
    {error && <p className="chat-error">{error}</p>}
    {cancelSheet}

    <Composer value={message} onChange={setMessage} onSend={send} busy={false} placeholder="Message Haulway…" />
  </section>;

  const headline = ({
    approved: "Your driver is locked in.",
    quoted: "Your quote is ready.",
    accepted: "Your haul is booked.",
    in_progress: "Your driver is on the way.",
    completed: "Your haul is complete.",
  } as Record<string, string>)[job.status] ?? "Your haul is moving.";
  const progressNote = ({
    approved: "Driver checked in",
    quoted: "Price ready to review",
    accepted: "Haul booked ✓",
    in_progress: "Heading your way",
    completed: "Finished by both sides",
  } as Record<string, string>)[job.status] ?? statusLabel(job.status);

  return <section className={`track-page status-${job.status}`}>
    <div className="track-nav">
      <button className="back-link" onClick={onBack}>← Requests</button>
      <span className={`status-pill ${job.status}`}>{statusLabel(job.status)}</span>
      {CANCELLABLE.has(job.status) && <span className="head-menu">
        <button className="menu-dots" onClick={() => setMenuOpen((value) => !value)} aria-label="Request options" aria-expanded={menuOpen}>⋮</button>
        {menuOpen && <>
          <button className="menu-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <span className="menu-pop"><button onClick={() => { setMenuOpen(false); setConfirmCancel(true); }}>Cancel request</button></span>
        </>}
      </span>}
    </div>

    <div className="track-body">
      <div className="track-hero enter">
        {job.status !== "completed" ? <TruckScene /> : <span className="complete-orbit" aria-hidden="true"><i>✓</i></span>}
        <span className="track-kicker"><i aria-hidden="true" /> LIVE REQUEST</span>
        <h2>{headline}</h2>
        <p>{job.status === "completed" ? "Both you and Haulway confirmed the work. One last step: settle your payment." : "Follow every step here. Timing and status update automatically."}</p>
      </div>

      <section className="journey-card enter" style={{ animationDelay: ".08s" }}>
        <header><span>HAUL PROGRESS</span><strong>{progressNote}</strong></header>
        <JobJourney status={job.status} />
      </section>

      {job.status !== "completed" && <div className="eta-block enter" style={{ animationDelay: ".14s" }}>
        <span className="eta-copy"><small>ESTIMATED ARRIVAL</small><strong>{job.eta ?? "Confirming now…"}</strong></span>
        <span className="eta-live"><i aria-hidden="true" />Updates automatically</span>
      </div>}

      <div className="track-facts enter" style={{ animationDelay: ".2s" }}>
        <div><small>SCHEDULED</small><strong>{shortDate(job.scheduledDate)}</strong><span>{displayTime(job.scheduledTime)}</span></div>
        <div><small>{job.dropoff ? "ROUTE" : "PICKUP"}</small><strong>{job.pickup}</strong>{job.dropoff && <span>to {job.dropoff}</span>}</div>
        {job.quoteCents != null && <div><small>QUOTE</small><strong>{money(job.quoteCents)}</strong><span>{job.status === "quoted" ? "Awaiting your approval" : "Confirmed"}</span></div>}
      </div>

      <div className="track-actions enter" style={{ animationDelay: ".26s" }}>
        {job.status === "quoted" && job.quoteCents != null && <section className="request-action quote">
          <div><small>YOUR QUOTE</small><strong>{money(job.quoteCents)}</strong><p>Review the price, then accept to lock in your haul.</p></div>
          <div className="request-action-row">
            <button className="decline-button" disabled={busy} onClick={() => void action("decline_quote")}>Decline</button>
            <button className="hw-primary" disabled={busy} onClick={() => void action("accept_quote")}>Accept quote</button>
          </div>
        </section>}

        {(job.status === "accepted" || job.status === "in_progress") && <section className="completion-card">
          <span><small>WHEN THE WORK IS FINISHED</small><strong>Confirm completion</strong></span>
          <p>Payment only unlocks after both sides confirm.</p>
          <SwipeToConfirm busy={busy} confirmed={job.customerConfirmed} onConfirm={() => action("confirm_complete")} />
        </section>}

        {job.status === "completed" && !job.paymentMethod && <section className="request-action payment">
          <div><small>FINAL STEP</small><strong>How will you pay?</strong><p>Choose the method you&apos;ll use with your driver.</p></div>
          <div className="request-action-row">
            <button className="pay-option" disabled={busy} onClick={() => void action("payment_method", { method: "interac" })}>Interac e-Transfer</button>
            <button className="pay-option" disabled={busy} onClick={() => void action("payment_method", { method: "cash" })}>Cash</button>
          </div>
        </section>}

        {job.status === "completed" && job.paymentMethod === "interac" && <section className="request-action payment-detail">
          <small>SEND YOUR INTERAC E-TRANSFER TO</small>
          <a className="interac-email" href={`mailto:${INTERAC_EMAIL}`}>{INTERAC_EMAIL}</a>
          <span className="interac-amount">{job.quoteCents ? money(job.quoteCents) : ""}</span>
          <em className={job.paymentStatus}>{job.paymentStatus === "paid" ? "Received ✓" : "Waiting on payment"}</em>
        </section>}

        {job.status === "completed" && job.paymentMethod === "cash" && <p className="payment-line payment-summary">
          Paying {job.quoteCents ? money(job.quoteCents) : ""} in cash, directly to the driver.
          <em className={job.paymentStatus}>{job.paymentStatus === "paid" ? "Received ✓" : "Not marked paid"}</em>
        </p>}

        {error && <p className="chat-error">{error}</p>}

        <button className="message-entry" onClick={() => setShowChat(true)}>
          <span className="message-entry-icon" aria-hidden="true">◇</span>
          <span><strong>Message Haulway</strong><small>Questions about access or timing?</small></span>
          {newMessages > 0 && <b>{newMessages > 9 ? "9+" : newMessages}</b>}
          <i aria-hidden="true">→</i>
        </button>
      </div>
    </div>
    {cancelSheet}
  </section>;
}

function SwipeToConfirm({ busy, confirmed, onConfirm }: { busy: boolean; confirmed: boolean; onConfirm: () => Promise<boolean> }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const current = useRef(0);

  function begin(event: ReactPointerEvent<HTMLButtonElement>) {
    if (busy || confirmed) return;
    start.current = event.clientX;
    current.current = 0;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    if (start.current == null || busy || confirmed) return;
    const maximum = Math.max(0, event.currentTarget.getBoundingClientRect().width - 64);
    const next = Math.min(maximum, Math.max(0, event.clientX - start.current));
    current.current = next;
    setOffset(next);
  }

  function finish(event: ReactPointerEvent<HTMLButtonElement>) {
    if (start.current == null) return;
    const maximum = Math.max(0, event.currentTarget.getBoundingClientRect().width - 64);
    const completed = maximum > 0 && current.current / maximum >= .72;
    start.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (completed) {
      setOffset(maximum);
      void onConfirm().then((succeeded) => {
        if (!succeeded) {
          current.current = 0;
          setOffset(0);
        }
      });
    } else {
      current.current = 0;
      setOffset(0);
    }
  }

  function keyConfirm(event: KeyboardEvent<HTMLButtonElement>) {
    if (!busy && !confirmed && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      void onConfirm();
    }
  }

  return <button
    type="button"
    className={`swipe-confirm ${dragging ? "dragging" : ""} ${confirmed ? "confirmed" : ""}`}
    style={{ "--swipe-x": `${offset}px` } as CSSProperties}
    disabled={busy || confirmed}
    aria-label={confirmed ? "Completion confirmed; waiting for Haulway" : "Swipe right to confirm the job is complete, or press Enter"}
    onPointerDown={begin}
    onPointerMove={move}
    onPointerUp={finish}
    onPointerCancel={finish}
    onKeyDown={keyConfirm}
  >
    <span className="swipe-fill" aria-hidden="true" />
    <span className="swipe-label">{confirmed ? "Confirmed — waiting on Haulway" : busy ? "Confirming…" : "Swipe to confirm complete"}</span>
    <span className="swipe-thumb" aria-hidden="true">{confirmed ? "✓" : "→"}</span>
  </button>;
}

/* ---------- Request sent ---------- */

function TruckScene() {
  return <div className="truck-scene" aria-hidden="true">
    <span className="truck-sun" />
    <span className="truck-hill a" /><span className="truck-hill b" />
    <span className="truck">
      <span className="truck-box" />
      <span className="truck-cab" />
      <span className="truck-wheel back" /><span className="truck-wheel front" />
    </span>
    <span className="truck-road"><i /></span>
  </div>;
}

function BookingLoader({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return <main className="booking-loader" role="status" aria-live="polite">
    <TruckScene />
    <h2>Booking your haul…</h2>
    <p>{done < total ? `Uploading photo ${Math.min(done + 1, total)} of ${total}.` : "Putting it in front of our drivers."}</p>
    <span className="booking-bar"><i style={{ width: `${done < total ? Math.max(pct, 6) : 100}%` }} /></span>
  </main>;
}

/* ---------- Boot + auth ---------- */

function Splash() {
  return <main className="splash-screen"><div className="splash-route route-a" /><div className="splash-route route-b" /><Logo light /><h1>Junk gone.<br />Small moves made simple.</h1><span className="splash-loader"><i /></span></main>;
}

function Registration({ otpRequired, onRegistered }: { otpRequired: boolean; onRegistered: (customer: Customer) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"details" | "code">("details");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true); setError("");
    try {
      await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone }) }).then(readJson);
      setStage("code");
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  /* Until SMS is funded the server runs the unverified route; the OTP screens
     below stay in place and switch back on the moment it is re-enabled. */
  async function signInDirect() {
    setBusy(true); setError("");
    try {
      const data = await fetch("/api/auth/direct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone }) }).then(readJson) as { customer: Customer };
      onRegistered(data.customer);
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (stage === "details") return void (otpRequired ? sendCode() : signInDirect());
    setBusy(true); setError("");
    try {
      const data = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone, code }) }).then(readJson) as { customer: Customer };
      onRegistered(data.customer);
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  return <main className="auth-screen">
    <div className="auth-top"><Logo /><div className="auth-art" aria-hidden="true"><i /><b>02</b><span>01</span></div></div>
    <form className="auth-sheet" onSubmit={submit}>
      <span className="micro-label">{stage === "details" ? "WELCOME" : "VERIFY YOUR NUMBER"}</span>
      <h1>{stage === "details" ? <>Clear space.<br /><em>Keep moving.</em></> : <>Check your<br /><em>messages.</em></>}</h1>
      <p>{stage === "details"
        ? otpRequired ? "Tell us where to text your secure sign-in code." : "Name and number. That's it."
        : <>We sent a 6-digit code to <strong>{phone}</strong>.</>}</p>
      <div className="auth-trust" aria-label="Registration benefits">
        <span>{otpRequired ? "✓ SMS verified" : "✓ Edmonton owned"}</span><span>✓ No password</span>
      </div>
      {stage === "details" ? <>
        <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" /></label>
        <label>Mobile number<span className="phone-field"><span>+1</span><input autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(780) 555-0148" /></span></label>
      </> : <>
        <label>Verification code<input className="auth-code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
        <div className="auth-code-actions">
          <button type="button" onClick={() => { setStage("details"); setCode(""); setError(""); }}>Change number</button>
          <button type="button" disabled={busy} onClick={() => void sendCode()}>Send again</button>
        </div>
      </>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="hw-primary wide" disabled={busy}>
        {busy
          ? stage === "details" ? (otpRequired ? "Sending…" : "Signing in…") : "Verifying…"
          : stage === "details" ? (otpRequired ? "Text me a code →" : "Continue →") : "Verify & continue →"}
      </button>
      <small>{stage === "details"
        ? otpRequired ? "Standard message rates may apply." : "Your details are saved securely for your requests."
        : "Codes expire quickly and can only be used once."}</small>
    </form>
  </main>;
}

/* ---------- Request flow ---------- */

function RequestFlow({ service, draft, onCancel, onCreated }: { service: Service; draft: Draft | null; onCancel: () => void; onCreated: (jobId: string) => void | Promise<void> }) {
  /* Photos never survive, so a restored draft always resumes on step 1. */
  const [step, setStep] = useState(1);
  const [restored, setRestored] = useState(Boolean(draft));
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [pickup, setPickup] = useState(draft?.pickup ?? "");
  const [pickupUnit, setPickupUnit] = useState(draft?.pickupUnit ?? "");
  const [pickupBuilding, setPickupBuilding] = useState(draft?.pickupBuilding ?? "");
  const [pickupStairs, setPickupStairs] = useState(draft?.pickupStairs ?? "");
  const [dropoff, setDropoff] = useState(draft?.dropoff ?? "");
  const [dropoffUnit, setDropoffUnit] = useState(draft?.dropoffUnit ?? "");
  const [dropoffBuilding, setDropoffBuilding] = useState(draft?.dropoffBuilding ?? "");
  const [dropoffStairs, setDropoffStairs] = useState(draft?.dropoffStairs ?? "");
  const [fragile, setFragile] = useState<boolean | null>(draft?.fragile ?? null);
  const [description, setDescription] = useState(draft?.description ?? "");
  const [infoOpen, setInfoOpen] = useState(Boolean(draft?.description));
  const [date, setDate] = useState(draft?.date ?? localDate());
  const [time, setTime] = useState(draft?.time ?? "10:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const title = service === "junk" ? "Junk removal" : "Small move";
  const steps = ["Photos", "Details", "Time"];

  /* Mirror the typed fields to storage as they change. Nothing is saved until the
     customer has entered something worth keeping. The parent re-reads on exit, so
     there is no need to push state upward on every keystroke. */
  useEffect(() => {
    const filled = [pickup, pickupUnit, pickupBuilding, pickupStairs, dropoff, dropoffUnit, dropoffBuilding, dropoffStairs, description].some(Boolean) || fragile !== null;
    if (!filled) return;
    writeDraft({
      service, pickup, pickupUnit, pickupBuilding, pickupStairs,
      dropoff, dropoffUnit, dropoffBuilding, dropoffStairs,
      fragile, description, date, time, savedAt: Date.now(),
    });
  }, [service, pickup, pickupUnit, pickupBuilding, pickupStairs, dropoff, dropoffUnit, dropoffBuilding, dropoffStairs, fragile, description, date, time]);

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const room = 8 - uploads.length;
    const files = Array.from(event.target.files ?? []).slice(0, room);
    setUploads((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), kind: file.type.startsWith("video/") ? "video" as const : "image" as const }))]);
    setError(""); event.target.value = "";
  }
  function removeFile(upload: Upload) { URL.revokeObjectURL(upload.url); setUploads((current) => current.filter((entry) => entry.id !== upload.id)); }
  function continuePhotos() { if (!uploads.some((entry) => entry.kind === "image")) return setError("Add at least one photo to continue."); setError(""); setStep(2); }

  /* Pickup is the only field the customer must fill. A move still needs somewhere to go.
     The button stays live and explains itself rather than sitting dead and unexplained. */
  function continueDetails() {
    if (!pickup.trim()) return failField("Add the pickup address to continue.", "pickup-address");
    if (service === "move" && !dropoff.trim()) return failField("Add the drop-off address to continue.", "dropoff-address");
    setError(""); setStep(3);
  }
  function failField(message: string, id: string) {
    setError(message);
    const field = document.getElementById(id) as HTMLInputElement | null;
    field?.focus();
    field?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  const summaryTitle = description.split("\n").map((line) => line.trim()).find(Boolean) || title;

  async function submit() {
    setBusy(true); setError("");
    let pendingJobId: string | null = null;
    try {
      const data = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType: service, pickup, dropoff, description, fragile,
          pickupUnit, pickupBuilding, pickupStairs,
          dropoffUnit, dropoffBuilding, dropoffStairs,
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
        setUploaded((count) => count + 1);
      }));
      const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failed) throw failed.reason;
      await fetch(`/api/jobs/${data.jobId}/uploads`, { method: "POST" }).then(readJson);
      uploads.forEach((upload) => URL.revokeObjectURL(upload.url));
      await onCreated(data.jobId);
    } catch (caught) {
      if (pendingJobId) void fetch(`/api/jobs/${pendingJobId}/uploads`, { method: "DELETE" });
      setError(errorMessage(caught));
    } finally { setBusy(false); }
  }

  /* Takes over the screen while photos upload — the flow behind it is done with. */
  if (busy) return <BookingLoader done={uploaded} total={uploads.length} />;

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
        {restored && <div className="draft-note">
          <span aria-hidden="true">✓</span>
          <span>We kept your details from last time — just add your photos again.</span>
          <button onClick={() => setRestored(false)} aria-label="Dismiss">×</button>
        </div>}
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
        <p>Only the addresses are required — the rest helps us quote accurately.</p>

        {error && <p className="step-error" role="alert">{error}</p>}

        <LocationBlock
          title={service === "move" ? "Pickup" : "Pickup address"} index="A" inputId="pickup-address"
          address={pickup} onAddress={setPickup} placeholder="Pickup address in Edmonton"
          unit={pickupUnit} onUnit={setPickupUnit}
          building={pickupBuilding} onBuilding={setPickupBuilding}
          stairs={pickupStairs} onStairs={setPickupStairs}
        />

        {service === "move" && <LocationBlock
          title="Drop-off" index="B" inputId="dropoff-address"
          address={dropoff} onAddress={setDropoff} placeholder="Drop-off address"
          unit={dropoffUnit} onUnit={setDropoffUnit}
          building={dropoffBuilding} onBuilding={setDropoffBuilding}
          stairs={dropoffStairs} onStairs={setDropoffStairs}
        />}

        <div className="chip-group standalone">
          <span className="chip-label">Is anything fragile?</span>
          <div className="chips two">
            <button type="button" className={`chip ${fragile === false ? "active" : ""}`} onClick={() => setFragile(fragile === false ? null : false)}>No</button>
            <button type="button" className={`chip ${fragile === true ? "active" : ""}`} onClick={() => setFragile(fragile === true ? null : true)}>Yes — handle with care</button>
          </div>
        </div>

        <div className={`info-drop ${infoOpen ? "open" : ""}`}>
          <button type="button" className="info-trigger" onClick={() => setInfoOpen((value) => !value)} aria-expanded={infoOpen} aria-controls="additional-info">
            <span>Additional information</span>
            <em>Optional</em>
            <i aria-hidden="true">▾</i>
          </button>
          <div className="info-drop-body" id="additional-info">
            <div className="info-drop-inner">
              <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Anything else we should know?" tabIndex={infoOpen ? 0 : -1} />
            </div>
          </div>
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
      <span className="flow-save"><i aria-hidden="true">✓</i>{step < 3 ? "Progress saves automatically" : "Quote first · no charge today"}</span>
      {step === 1 && <button className="hw-primary wide" onClick={continuePhotos}>Continue<span>→</span></button>}
      {step === 2 && <button className="hw-primary wide" onClick={continueDetails}>Continue<span aria-hidden="true">→</span></button>}
      {step === 3 && <button className="hw-primary wide" disabled={busy} onClick={submit}>Book my haul<span aria-hidden="true">→</span></button>}
    </div>
  </div>;
}

function LocationBlock({ title, index, inputId, address, onAddress, placeholder, unit, onUnit, building, onBuilding, stairs, onStairs }: {
  title: string; index: string; inputId: string; address: string; onAddress: (value: string) => void; placeholder: string;
  unit: string; onUnit: (value: string) => void;
  building: string; onBuilding: (value: string) => void; stairs: string; onStairs: (value: string) => void;
}) {
  const needsUnit = building === NEEDS_UNIT;
  return <div className="loc-block">
    <div className="loc-head"><i aria-hidden="true">{index}</i><strong>{title}</strong><em>Required</em></div>
    <input id={inputId} value={address} onChange={(event) => onAddress(event.target.value)} placeholder={placeholder} aria-label={`${title} address`} autoComplete="street-address" />
    <ChipGroup label="Type of building" options={BUILDING_TYPES} value={building} onChange={onBuilding} />
    {/* Revealed only for an apartment — the driver needs a door to knock on. */}
    <div className={`unit-slot ${needsUnit ? "open" : ""}`} aria-hidden={!needsUnit}>
      <div className="unit-slot-inner">
        <label className="unit-field">
          <span className="chip-label">Apartment / unit number</span>
          <input value={unit} onChange={(event) => onUnit(event.target.value)} placeholder="e.g. 402" maxLength={20} tabIndex={needsUnit ? 0 : -1} />
        </label>
      </div>
    </div>
    <ChipGroup label="Stairs" options={STAIRS_OPTIONS} value={stairs} onChange={onStairs} two />
  </div>;
}

function ChipGroup({ label, options, value, onChange, two = false }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void; two?: boolean }) {
  return <div className="chip-group">
    <span className="chip-label">{label}</span>
    <div className={`chips ${two ? "two" : ""}`} role="group" aria-label={label}>
      {options.map((option) => <button key={option} type="button" aria-pressed={value === option} className={`chip ${value === option ? "active" : ""}`} onClick={() => onChange(value === option ? "" : option)}>{option}</button>)}
    </div>
  </div>;
}

/* ---------- helpers ---------- */

function describeJobUpdate(before: Job, after: Job): Omit<InAppUpdate, "id" | "jobId"> | null {
  const accepted = before.status === "requested" && after.status !== "requested" && after.status !== "cancelled";
  if (accepted) return {
    title: "A driver accepted your haul",
    detail: `${after.item} · ${after.eta ? `ETA ${after.eta}` : "Opening live tracking"}`,
    icon: "🚚",
  };

  if (after.quoteCents != null && (before.quoteCents !== after.quoteCents || before.status !== after.status && after.status === "quoted")) return {
    title: before.quoteCents == null ? "Your quote is ready" : "Your quote was updated",
    detail: `${after.item} · ${money(after.quoteCents)}${after.eta ? ` · ETA ${after.eta}` : ""}`,
    icon: "💬",
  };

  if (before.eta !== after.eta) return {
    title: after.eta ? "Your ETA was updated" : "Your driver is updating the ETA",
    detail: `${after.item}${after.eta ? ` · Arriving ${after.eta}` : " · Check back shortly"}`,
    icon: "🕒",
  };

  if (!before.operatorConfirmed && after.operatorConfirmed) return {
    title: "Your driver marked the haul complete",
    detail: `${after.item} · Open the request to confirm`,
    icon: "✓",
  };

  if (before.paymentStatus !== "paid" && after.paymentStatus === "paid") return {
    title: "Payment received",
    detail: `${after.item} · Thanks for choosing Haulway`,
    icon: "✓",
  };

  if (before.status !== after.status) {
    const statusCopy: Record<string, { title: string; detail: string; icon: string }> = {
      approved: { title: "A driver accepted your haul", detail: "Open live tracking for the latest ETA", icon: "🚚" },
      quoted: { title: "Your quote is ready", detail: "Open the request to review it", icon: "💬" },
      accepted: { title: "Your haul is booked", detail: "Your driver will keep the ETA updated", icon: "✓" },
      in_progress: { title: "Your driver is on the way", detail: after.eta ? `Arriving ${after.eta}` : "Open live tracking for updates", icon: "🚚" },
      completed: { title: "Your haul is complete", detail: "Open the request for payment details", icon: "✓" },
      cancelled: { title: "Your haul was cancelled", detail: "Open the request for details", icon: "!" },
    };
    const copy = statusCopy[after.status];
    if (copy) return { ...copy, detail: `${after.item} · ${copy.detail}` };
  }

  const newMessages = (after.messageCount ?? 0) - (before.messageCount ?? 0);
  if (newMessages > 0) return {
    title: newMessages === 1 ? "New message from Haulway" : `${newMessages} new messages from Haulway`,
    detail: `${after.item} · Tap to reply`,
    icon: "💬",
  };

  return null;
}

async function readJson(response: Response) {
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }

/* A part-filled booking, kept so a reload or a backgrounded tab doesn't cost the
   customer six fields of typing. Photos can't come along — File objects aren't
   serialisable — so a restored draft always lands back on the photo step. */
type Draft = {
  service: Service;
  pickup: string; pickupUnit: string; pickupBuilding: string; pickupStairs: string;
  dropoff: string; dropoffUnit: string; dropoffBuilding: string; dropoffStairs: string;
  fragile: boolean | null; description: string; date: string; time: string;
  savedAt: number;
};
const DRAFT_KEY = "hw_draft";
const DRAFT_TTL = 24 * 60 * 60 * 1000;

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (!draft?.savedAt || Date.now() - draft.savedAt > DRAFT_TTL) { localStorage.removeItem(DRAFT_KEY); return null; }
    return draft;
  } catch { return null; }
}
function writeDraft(draft: Draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage unavailable */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
}

/* How many messages the customer had already read per haul. Private-mode Safari
   throws on storage access, so every touch is guarded. */
const SEEN_KEY = "hw_seen_messages";
function readSeen(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>; } catch { return {}; }
}
function writeSeen(value: Record<string, number>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
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
function statusLabel(status: string) { return ({ requested: "Looking for a driver", approved: "Driver found", quoted: "Quote ready", accepted: "Booked", in_progress: "On the way", completed: "Complete", cancelled: "Cancelled" } as Record<string, string>)[status] ?? status; }
