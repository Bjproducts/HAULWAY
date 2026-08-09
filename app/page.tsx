"use client";

import { FormEvent, useState } from "react";

type Role = "customer" | "driver";
type Message = { id: number; author: Role | "system"; text: string; time: string };

const services = [
  { id: "Junk removal", number: "01", title: "Junk removal", text: "Furniture, appliances, yard waste and general clutter." },
  { id: "Small move", number: "02", title: "Small move", text: "Move one item or a few pieces across town." },
];

const dates = ["Wed, Aug 12", "Thu, Aug 13", "Fri, Aug 14"];

export default function Home() {
  const [role, setRole] = useState<Role>("customer");
  const [customerView, setCustomerView] = useState<"overview" | "book" | "jobs">("overview");
  const [driverView, setDriverView] = useState<"opportunities" | "active" | "earnings">("opportunities");
  const [bookingStep, setBookingStep] = useState(1);
  const [service, setService] = useState("Small move");
  const [item, setItem] = useState("Couch");
  const [pickup, setPickup] = useState("1432 W Alder St, Denver");
  const [dropoff, setDropoff] = useState("818 N Grant Ave, Denver");
  const [notes, setNotes] = useState("Three-seat couch. One flight of stairs at pickup.");
  const [date, setDate] = useState(dates[0]);
  const [time, setTime] = useState("10:00 AM – 12:00 PM");
  const [jobScheduled, setJobScheduled] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState<"sent" | "accepted" | "declined">("sent");
  const [quoteAmount, setQuoteAmount] = useState("145");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [customerConfirmed, setCustomerConfirmed] = useState(false);
  const [driverConfirmed, setDriverConfirmed] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, author: "customer", text: "Hi Marcus — the couch is ready by the front door.", time: "9:18 AM" },
    { id: 2, author: "driver", text: "Perfect. I can bring a second mover and handle the stairs.", time: "9:21 AM" },
  ]);

  const released = customerConfirmed && driverConfirmed;

  function switchRole(nextRole: Role) {
    setRole(nextRole);
    setChatOpen(false);
  }

  function scheduleJob() {
    setJobScheduled(true);
    setQuoteStatus("sent");
    setPaymentMethod("");
    setCustomerConfirmed(false);
    setDriverConfirmed(false);
    setBookingStep(4);
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setMessages((current) => [
      ...current,
      { id: Date.now(), author: role, text: draft.trim(), time: "Just now" },
    ]);
    setDraft("");
  }

  function acceptQuote() {
    setQuoteStatus("accepted");
    setMessages((current) => [
      ...current,
      { id: Date.now(), author: "system", text: `Quote accepted for $${quoteAmount}.`, time: "Just now" },
    ]);
  }

  function sendQuote() {
    setQuoteStatus("sent");
    setMessages((current) => [
      ...current,
      { id: Date.now(), author: "system", text: `Marcus sent a quote for $${quoteAmount}.`, time: "Just now" },
    ]);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => role === "customer" && setCustomerView("overview")} aria-label="Haulway home">
          <span className="brand-mark">H</span>
          <span>HAULWAY</span>
        </button>

        <nav className="role-switch" aria-label="Switch app view">
          <button className={role === "customer" ? "active" : ""} onClick={() => switchRole("customer")}>Customer</button>
          <button className={role === "driver" ? "active" : ""} onClick={() => switchRole("driver")}>Driver</button>
        </nav>

        <div className="top-actions">
          <span className="demo-badge"><span /> Interactive demo</span>
          <button className="avatar" aria-label="Open profile">AJ</button>
        </div>
      </header>

      {role === "customer" ? (
        <CustomerApp
          view={customerView}
          setView={setCustomerView}
          bookingStep={bookingStep}
          setBookingStep={setBookingStep}
          service={service}
          setService={setService}
          item={item}
          setItem={setItem}
          pickup={pickup}
          setPickup={setPickup}
          dropoff={dropoff}
          setDropoff={setDropoff}
          notes={notes}
          setNotes={setNotes}
          date={date}
          setDate={setDate}
          time={time}
          setTime={setTime}
          scheduleJob={scheduleJob}
          jobScheduled={jobScheduled}
          quoteStatus={quoteStatus}
          quoteAmount={quoteAmount}
          paymentMethod={paymentMethod}
          driverConfirmed={driverConfirmed}
          customerConfirmed={customerConfirmed}
          released={released}
          openChat={() => setChatOpen(true)}
          switchToDriver={() => switchRole("driver")}
        />
      ) : (
        <DriverApp
          view={driverView}
          setView={setDriverView}
          item={item}
          pickup={pickup}
          dropoff={dropoff}
          date={date}
          time={time}
          notes={notes}
          jobScheduled={jobScheduled}
          quoteStatus={quoteStatus}
          quoteAmount={quoteAmount}
          paymentMethod={paymentMethod}
          customerConfirmed={customerConfirmed}
          driverConfirmed={driverConfirmed}
          released={released}
          confirm={() => setDriverConfirmed(true)}
          openChat={() => setChatOpen(true)}
        />
      )}

      {chatOpen && (
        <ChatPanel
          role={role}
          messages={messages}
          draft={draft}
          setDraft={setDraft}
          sendMessage={sendMessage}
          close={() => setChatOpen(false)}
          quoteStatus={quoteStatus}
          quoteAmount={quoteAmount}
          setQuoteAmount={setQuoteAmount}
          acceptQuote={acceptQuote}
          declineQuote={() => setQuoteStatus("declined")}
          sendQuote={sendQuote}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          customerConfirmed={customerConfirmed}
          driverConfirmed={driverConfirmed}
          setCustomerConfirmed={setCustomerConfirmed}
          setDriverConfirmed={setDriverConfirmed}
          released={released}
        />
      )}
    </main>
  );
}

type CustomerProps = {
  view: "overview" | "book" | "jobs";
  setView: (view: "overview" | "book" | "jobs") => void;
  bookingStep: number;
  setBookingStep: (step: number) => void;
  service: string;
  setService: (service: string) => void;
  item: string;
  setItem: (item: string) => void;
  pickup: string;
  setPickup: (value: string) => void;
  dropoff: string;
  setDropoff: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  date: string;
  setDate: (value: string) => void;
  time: string;
  setTime: (value: string) => void;
  scheduleJob: () => void;
  jobScheduled: boolean;
  quoteStatus: string;
  quoteAmount: string;
  paymentMethod: string;
  driverConfirmed: boolean;
  customerConfirmed: boolean;
  released: boolean;
  openChat: () => void;
  switchToDriver: () => void;
};

function CustomerApp(props: CustomerProps) {
  const { view, setView } = props;
  return (
    <>
      <div className="subnav-wrap">
        <nav className="subnav" aria-label="Customer navigation">
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>Overview</button>
          <button className={view === "jobs" ? "active" : ""} onClick={() => setView("jobs")}>My jobs <span className="nav-count">1</span></button>
          <button onClick={props.openChat}>Messages <span className="unread-dot" /></button>
        </nav>
      </div>
      {view === "book" ? <BookingFlow {...props} /> : view === "jobs" ? <JobsView {...props} /> : <CustomerOverview {...props} />}
    </>
  );
}

function CustomerOverview(props: CustomerProps) {
  return (
    <div className="page customer-page">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow light">JUNK REMOVAL + SMALL MOVES</span>
          <h1>Get it gone.<br /><em>Without the runaround.</em></h1>
          <p>Tell us what needs moving, pick a time, and get a clear quote from a trusted local driver.</p>
          <button className="primary-button bright" onClick={() => { props.setView("book"); props.setBookingStep(1); }}>
            Schedule a pickup <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="hero-route" aria-label="How Haulway works">
          <div className="route-stop">
            <span className="route-number">01</span>
            <div><strong>Share the job</strong><small>Items, photos & addresses</small></div>
          </div>
          <div className="route-line" />
          <div className="route-stop">
            <span className="route-number">02</span>
            <div><strong>Choose your quote</strong><small>Chat directly with a driver</small></div>
          </div>
          <div className="route-line" />
          <div className="route-stop">
            <span className="route-number">03</span>
            <div><strong>Confirm it&apos;s done</strong><small>Payment stays protected until then</small></div>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div>
          <div className="section-heading">
            <div><span className="eyebrow">ACTIVE JOB</span><h2>Your couch is on the move</h2></div>
            <button className="text-button" onClick={() => props.setView("jobs")}>View job details →</button>
          </div>
          <JobCard {...props} />
        </div>
        <aside className="trust-panel">
          <span className="eyebrow">THE HAULWAY HOLD</span>
          <h3>Your money moves when the job is done.</h3>
          <p>We securely authorize your payment, then release it only after both you and the driver confirm completion.</p>
          <div className="hold-visual">
            <span className="hold-lock">H</span>
            <div><strong>$145.00</strong><small>{props.released ? "Released to driver" : props.paymentMethod ? "Protected in Haulway Hold" : "Awaiting payment method"}</small></div>
          </div>
          <div className="trust-foot"><span>✓ No surprise charges</span><span>✓ Support if plans change</span></div>
        </aside>
      </section>
    </div>
  );
}

function JobCard(props: CustomerProps) {
  const statusText = props.released ? "Payment released" : props.customerConfirmed ? "Waiting for driver" : props.driverConfirmed ? "Ready for your confirmation" : props.paymentMethod ? "Pickup confirmed" : "Quote ready";
  return (
    <article className="job-card">
      <div className="job-card-top">
        <div className="item-icon">CO</div>
        <div className="job-title"><div className="status-tag amber"><span /> {statusText}</div><h3>{props.item} move</h3><p>Job HW-2048 · Driver: Marcus T.</p></div>
        <div className="job-price"><small>Driver quote</small><strong>${props.quoteAmount}</strong></div>
      </div>
      <div className="route-summary">
        <div className="route-point"><i className="point pickup" /><div><small>PICKUP</small><strong>{props.pickup}</strong></div></div>
        <div className="mini-route" />
        <div className="route-point"><i className="point dropoff" /><div><small>DROP-OFF</small><strong>{props.dropoff}</strong></div></div>
      </div>
      <div className="job-card-foot">
        <div className="schedule-chip"><span className="calendar-icon">12</span><div><small>SCHEDULED</small><strong>{props.date} · 10 AM–12 PM</strong></div></div>
        <div className="job-actions">
          <button className="secondary-button" onClick={props.openChat}>Message Marcus <span className="unread-dot" /></button>
          <button className="primary-button" onClick={props.openChat}>{props.paymentMethod ? "Track completion" : "Review quote"}</button>
        </div>
      </div>
    </article>
  );
}

function BookingFlow(props: CustomerProps) {
  const stepNames = ["Service", "Details", "Schedule"];
  return (
    <div className="booking-page">
      <button className="back-link" onClick={() => props.setView("overview")}>← Back to overview</button>
      <div className="booking-layout">
        <aside className="booking-sidebar">
          <span className="eyebrow light">NEW JOB</span>
          <h1>Let&apos;s get it<br />moving.</h1>
          <p>Three quick steps. Drivers nearby will see your request and send a quote.</p>
          <ol className="step-list">
            {stepNames.map((name, index) => (
              <li key={name} className={props.bookingStep === index + 1 ? "active" : props.bookingStep > index + 1 ? "done" : ""}>
                <span>{props.bookingStep > index + 1 ? "✓" : index + 1}</span>{name}
              </li>
            ))}
          </ol>
          <div className="sidebar-note"><span>H</span><p><strong>Protected by Haulway Hold</strong>Your driver is paid only when the job is complete.</p></div>
        </aside>
        <section className="booking-form-card">
          {props.bookingStep === 1 && (
            <div className="form-section">
              <span className="step-kicker">STEP 1 OF 3</span>
              <h2>What can we help with?</h2>
              <p className="form-intro">Choose the option that best fits your job.</p>
              <div className="service-options">
                {services.map((option) => (
                  <button key={option.id} className={`service-option ${props.service === option.id ? "selected" : ""}`} onClick={() => props.setService(option.id)}>
                    <span className="service-number">{option.number}</span>
                    <span><strong>{option.title}</strong><small>{option.text}</small></span>
                    <i>{props.service === option.id ? "✓" : "→"}</i>
                  </button>
                ))}
              </div>
              <div className="form-footer"><span>Your selection can be changed later.</span><button className="primary-button" onClick={() => props.setBookingStep(2)}>Continue →</button></div>
            </div>
          )}
          {props.bookingStep === 2 && (
            <div className="form-section">
              <span className="step-kicker">STEP 2 OF 3</span><h2>Tell us about the job</h2><p className="form-intro">Good details help drivers send an accurate quote.</p>
              <div className="field-grid two">
                <label>Item or category<input value={props.item} onChange={(e) => props.setItem(e.target.value)} /></label>
                <label>Approximate size<select defaultValue="Large"><option>Small</option><option>Medium</option><option>Large</option><option>Extra large</option></select></label>
              </div>
              <label>Pickup address<input value={props.pickup} onChange={(e) => props.setPickup(e.target.value)} /></label>
              {props.service === "Small move" && <label>Drop-off address<input value={props.dropoff} onChange={(e) => props.setDropoff(e.target.value)} /></label>}
              <label>Notes for the driver<textarea value={props.notes} onChange={(e) => props.setNotes(e.target.value)} rows={3} /></label>
              <button className="upload-box" type="button"><span>+</span><strong>Add photos</strong><small>Optional in this demo · JPG or PNG</small></button>
              <div className="form-footer"><button className="text-button" onClick={() => props.setBookingStep(1)}>← Back</button><button className="primary-button" onClick={() => props.setBookingStep(3)}>Choose a time →</button></div>
            </div>
          )}
          {props.bookingStep === 3 && (
            <div className="form-section">
              <span className="step-kicker">STEP 3 OF 3</span><h2>When should we move it?</h2><p className="form-intro">Choose a window that works. Your driver will confirm in chat.</p>
              <div className="date-options">
                {dates.map((option, index) => <button key={option} className={props.date === option ? "selected" : ""} onClick={() => props.setDate(option)}><small>{index === 0 ? "EARLIEST" : "AVAILABLE"}</small><strong>{option}</strong></button>)}
              </div>
              <label>Pickup window<select value={props.time} onChange={(e) => props.setTime(e.target.value)}><option>8:00 AM – 10:00 AM</option><option>10:00 AM – 12:00 PM</option><option>1:00 PM – 3:00 PM</option><option>4:00 PM – 6:00 PM</option></select></label>
              <div className="booking-summary"><div><span className="summary-icon">CO</span><div><strong>{props.item} · {props.service}</strong><small>{props.pickup} → {props.dropoff}</small></div></div><span>Quote set by driver</span></div>
              <div className="form-footer"><button className="text-button" onClick={() => props.setBookingStep(2)}>← Back</button><button className="primary-button" onClick={props.scheduleJob}>Post job →</button></div>
            </div>
          )}
          {props.bookingStep === 4 && (
            <div className="success-state">
              <span className="success-mark">✓</span><span className="eyebrow">JOB POSTED</span><h2>Your couch move is live.</h2>
              <p>Nearby drivers can now review the details and message you with a quote.</p>
              <div className="success-summary"><div><small>JOB</small><strong>HW-2048 · {props.item}</strong></div><div><small>WHEN</small><strong>{props.date}, {props.time}</strong></div></div>
              <div className="success-actions"><button className="primary-button" onClick={() => props.setView("overview")}>View my job</button><button className="secondary-button" onClick={props.switchToDriver}>See driver view →</button></div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function JobsView(props: CustomerProps) {
  return (
    <div className="page jobs-page">
      <div className="page-title-row"><div><span className="eyebrow">MY JOBS</span><h1>Every move, in one place.</h1></div><button className="primary-button" onClick={() => { props.setView("book"); props.setBookingStep(1); }}>+ New job</button></div>
      <div className="jobs-tabs"><button className="active">Active <span>1</span></button><button>Completed <span>3</span></button><button>Cancelled <span>0</span></button></div>
      <JobCard {...props} />
    </div>
  );
}

type DriverProps = {
  view: "opportunities" | "active" | "earnings";
  setView: (view: "opportunities" | "active" | "earnings") => void;
  item: string; pickup: string; dropoff: string; date: string; time: string; notes: string;
  jobScheduled: boolean; quoteStatus: string; quoteAmount: string; paymentMethod: string;
  customerConfirmed: boolean; driverConfirmed: boolean; released: boolean;
  confirm: () => void; openChat: () => void;
};

function DriverApp(props: DriverProps) {
  return (
    <>
      <div className="subnav-wrap driver-nav">
        <nav className="subnav" aria-label="Driver navigation">
          <button className={props.view === "opportunities" ? "active" : ""} onClick={() => props.setView("opportunities")}>Opportunities <span className="nav-count">3</span></button>
          <button className={props.view === "active" ? "active" : ""} onClick={() => props.setView("active")}>My jobs <span className="nav-count pale">1</span></button>
          <button className={props.view === "earnings" ? "active" : ""} onClick={() => props.setView("earnings")}>Earnings</button>
        </nav>
      </div>
      <div className="page driver-page">
        <div className="driver-heading">
          <div><span className="eyebrow">DRIVER DASHBOARD</span><h1>{props.view === "earnings" ? "Your earnings" : "Good morning, Marcus."}</h1><p>{props.view === "earnings" ? "A clear view of completed work and payouts." : "Three nearby jobs are ready for a quote."}</p></div>
          <div className="availability"><span className="toggle-on"><i /></span><div><strong>Available</strong><small>Receiving nearby jobs</small></div></div>
        </div>
        {props.view === "earnings" ? <EarningsView /> : (
          <>
            <div className="driver-stats"><div><small>THIS WEEK</small><strong>$684</strong><span>↑ 12% from last week</span></div><div><small>JOBS COMPLETED</small><strong>7</strong><span>4.9 average rating</span></div><div><small>ACTIVE JOBS</small><strong>1</strong><span>${props.quoteAmount} held securely</span></div></div>
            <div className="driver-workspace">
              <aside className="opportunity-list">
                <div className="list-heading"><strong>{props.view === "active" ? "Active jobs" : "Nearby opportunities"}</strong><button aria-label="Filter jobs">≡</button></div>
                <button className="opportunity active"><span className="status-tag green">{props.view === "active" ? "ACTIVE" : "NEW · 0.8 MI"}</span><strong>{props.item} move</strong><small>Capitol Hill → Uptown</small><div><span>{props.date}</span><b>${props.quoteAmount}</b></div></button>
                {props.view !== "active" && <><button className="opportunity"><span className="status-tag">1.4 MI</span><strong>Garage cleanout</strong><small>Washington Park</small><div><span>Thu, Aug 13</span><b>Quote</b></div></button><button className="opportunity"><span className="status-tag">2.1 MI</span><strong>Mattress removal</strong><small>Cherry Creek</small><div><span>Fri, Aug 14</span><b>Quote</b></div></button></>}
              </aside>
              <section className="job-detail">
                <div className="job-detail-head"><div><span className="status-tag amber">{props.quoteStatus === "accepted" ? "BOOKED" : "QUOTE REQUESTED"}</span><h2>{props.item} move</h2><p>Posted by Alex J. · Job HW-2048</p></div><button className="secondary-button" onClick={props.openChat}>Open chat <span className="unread-dot" /></button></div>
                <div className="detail-route">
                  <div><span className="map-pin start">A</span><small>PICKUP</small><strong>{props.pickup}</strong><em>One flight of stairs</em></div>
                  <div className="route-distance"><span>2.8 miles</span></div>
                  <div><span className="map-pin end">B</span><small>DROP-OFF</small><strong>{props.dropoff}</strong><em>Ground-floor entry</em></div>
                </div>
                <div className="detail-grid"><div><small>ITEM</small><strong>{props.item} · Large</strong></div><div><small>WHEN</small><strong>{props.date}</strong><span>{props.time}</span></div><div><small>HELP NEEDED</small><strong>Two movers</strong><span>Customer cannot assist</span></div></div>
                <div className="customer-note"><span>AJ</span><div><small>ALEX&apos;S NOTE</small><p>“{props.notes}”</p></div></div>
                <div className="driver-cta">
                  <div><small>{props.paymentMethod ? "PAYMENT STATUS" : "YOUR QUOTE"}</small><strong>{props.paymentMethod ? `$${props.quoteAmount} secured` : props.quoteStatus === "accepted" ? `$${props.quoteAmount} accepted` : "Ready to price this job?"}</strong></div>
                  {props.paymentMethod ? <button className="primary-button" disabled={props.driverConfirmed} onClick={props.confirm}>{props.driverConfirmed ? "Completion confirmed ✓" : "Mark job complete"}</button> : <button className="primary-button" onClick={props.openChat}>{props.quoteStatus === "accepted" ? "Await customer payment" : "Message & quote"} →</button>}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function EarningsView() {
  return (
    <div className="earnings-grid">
      <section className="earnings-card dark"><span>AVAILABLE TO CASH OUT</span><strong>$684.00</strong><button className="primary-button bright">Transfer to bank</button><small>Usually arrives in 1–2 business days.</small></section>
      <section className="earnings-card"><div className="list-heading"><strong>Recent payouts</strong><button>View all</button></div><div className="payout-row"><span>CO</span><div><strong>Couch move</strong><small>Aug 6 · HW-2019</small></div><b>+$160</b></div><div className="payout-row"><span>GR</span><div><strong>Garage cleanout</strong><small>Aug 4 · HW-1988</small></div><b>+$285</b></div><div className="payout-row"><span>MA</span><div><strong>Mattress removal</strong><small>Aug 2 · HW-1952</small></div><b>+$89</b></div></section>
    </div>
  );
}

type ChatProps = {
  role: Role; messages: Message[]; draft: string; setDraft: (value: string) => void; sendMessage: (event: FormEvent) => void; close: () => void;
  quoteStatus: "sent" | "accepted" | "declined"; quoteAmount: string; setQuoteAmount: (value: string) => void; acceptQuote: () => void; declineQuote: () => void; sendQuote: () => void;
  paymentMethod: string; setPaymentMethod: (value: string) => void; customerConfirmed: boolean; driverConfirmed: boolean; setCustomerConfirmed: (value: boolean) => void; setDriverConfirmed: (value: boolean) => void; released: boolean;
};

function ChatPanel(props: ChatProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && props.close()}>
      <section className="chat-panel" role="dialog" aria-modal="true" aria-label="Job chat with Marcus">
        <header className="chat-header">
          <div className="chat-person"><span className="avatar large">{props.role === "customer" ? "MT" : "AJ"}<i /></span><div><strong>{props.role === "customer" ? "Marcus T." : "Alex J."}</strong><small>{props.role === "customer" ? "Driver · 4.9 ★ · Online" : "Customer · Job HW-2048"}</small></div></div>
          <button className="close-button" onClick={props.close} aria-label="Close chat">×</button>
        </header>
        <div className="chat-job-strip"><span>CO</span><div><small>JOB HW-2048</small><strong>Couch move · Wed, Aug 12</strong></div><button>${props.quoteAmount} quote</button></div>
        <div className="message-list">
          <div className="date-divider"><span>Today</span></div>
          {props.messages.map((message) => message.author === "system" ? (
            <div className="system-message" key={message.id}>{message.text}</div>
          ) : (
            <div className={`message ${message.author === props.role ? "mine" : "theirs"}`} key={message.id}><p>{message.text}</p><small>{message.time}</small></div>
          ))}

          {props.role === "customer" && props.quoteStatus === "sent" && (
            <div className="quote-card">
              <span className="eyebrow">DRIVER QUOTE</span><div className="quote-line"><div><strong>${props.quoteAmount}</strong><small>Includes two movers + transport</small></div><span>Valid today</span></div>
              <div className="quote-actions"><button className="secondary-button" onClick={props.declineQuote}>Decline</button><button className="primary-button" onClick={props.acceptQuote}>Accept quote</button></div>
            </div>
          )}

          {props.role === "driver" && props.quoteStatus !== "accepted" && (
            <div className="quote-composer"><span className="eyebrow">SEND A QUOTE</span><div><label><span>$</span><input aria-label="Quote amount" inputMode="numeric" value={props.quoteAmount} onChange={(e) => props.setQuoteAmount(e.target.value.replace(/\D/g, ""))} /></label><button className="primary-button" onClick={props.sendQuote}>Send quote →</button></div><small>Customer can accept or decline in this chat.</small></div>
          )}

          {props.role === "customer" && props.quoteStatus === "accepted" && !props.paymentMethod && (
            <div className="payment-card">
              <span className="eyebrow">SECURE YOUR BOOKING</span><h3>Choose a payment method</h3><p>You won&apos;t be charged until both sides confirm the job is done.</p>
              <div className="payment-options">
                <button onClick={() => props.setPaymentMethod("Visa ···· 4242")}><span className="card-brand">VISA</span><div><strong>Visa ending 4242</strong><small>Default card</small></div><i>→</i></button>
                <button onClick={() => props.setPaymentMethod("Apple Pay")}><span className="card-brand apple">●</span><div><strong>Apple Pay</strong><small>Fast, secure checkout</small></div><i>→</i></button>
              </div>
            </div>
          )}

          {props.paymentMethod && (
            <div className={`completion-card ${props.released ? "released" : ""}`}>
              <span className="hold-icon">H</span>
              <div className="completion-copy"><span className="eyebrow">{props.released ? "PAYMENT RELEASED" : "HAULWAY HOLD ACTIVE"}</span><h3>{props.released ? `$${props.quoteAmount} sent to Marcus` : `$${props.quoteAmount} is protected`}</h3><p>{props.released ? "Both sides confirmed a successful job." : "Each person confirms completion separately."}</p></div>
              <div className="confirm-rows">
                <div className={props.customerConfirmed ? "confirmed" : ""}><span>{props.customerConfirmed ? "✓" : "1"}</span><div><strong>Customer confirmation</strong><small>{props.customerConfirmed ? "Complete" : props.role === "customer" ? "Ready when the job is done" : "Waiting for Alex"}</small></div>{props.role === "customer" && !props.customerConfirmed && <button onClick={() => props.setCustomerConfirmed(true)}>Confirm done</button>}</div>
                <div className={props.driverConfirmed ? "confirmed" : ""}><span>{props.driverConfirmed ? "✓" : "2"}</span><div><strong>Driver confirmation</strong><small>{props.driverConfirmed ? "Complete" : props.role === "driver" ? "Ready when the job is done" : "Waiting for Marcus"}</small></div>{props.role === "driver" && !props.driverConfirmed && <button onClick={() => props.setDriverConfirmed(true)}>Confirm done</button>}</div>
              </div>
            </div>
          )}
        </div>
        <form className="message-form" onSubmit={props.sendMessage}><button type="button" aria-label="Add attachment">+</button><input aria-label="Message" placeholder="Write a message…" value={props.draft} onChange={(e) => props.setDraft(e.target.value)} /><button type="submit" className="send-button">Send ↑</button></form>
      </section>
    </div>
  );
}
