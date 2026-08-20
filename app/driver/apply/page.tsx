"use client";

import { FormEvent, useState } from "react";
import { PRIVACY_CONTACT_EMAIL } from "@/lib/contracts";
import { errorMessage, readJson } from "../../http";

type Step = "details" | "verify" | "done";

export default function DriverApplicationPage() {
  const [step, setStep] = useState<Step>("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    serviceArea: "Edmonton and area",
    vehicleType: "",
    axleCount: "2",
    registeredGvwKg: "",
    licenceClass: "5",
    licenceExpiresOn: "",
    hasTrailer: false,
    travelsOutsideAlberta: false,
    legalWorkAttested: false,
    privacyConsented: false,
    screeningConsented: false,
    companyWebsite: "",
  });

  function update(name: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await fetch("/api/driver/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.phone, purpose: "application", companyWebsite: form.companyWebsite }),
      }).then(readJson);
      setStep("verify");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally { setBusy(false); }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await fetch("/api/driver/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          purpose: "application",
          code,
          axleCount: Number(form.axleCount),
          registeredGvwKg: Number(form.registeredGvwKg),
        }),
      }).then(readJson);
      setStep("done");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally { setBusy(false); }
  }

  const heavyVehicle = Number(form.registeredGvwKg) >= 11794
    || (form.travelsOutsideAlberta && Number(form.registeredGvwKg) > 4500);

  return <main className="driver-apply-shell">
    <header className="driver-apply-bar">
      <a href="/driver" aria-label="Back to driver sign in">←</a>
      <span><b>HAULWAY</b><small>DRIVER APPLICATION</small></span>
      <i>{step === "details" ? "1/2" : step === "verify" ? "2/2" : "✓"}</i>
    </header>

    {step === "details" && <form className="driver-apply-form" onSubmit={requestCode}>
      <div className="driver-apply-intro">
        <span className="micro-label">DRIVE WITH HAULWAY</span>
        <h1>Start with the essentials.</h1>
        <p>Apply as an independent contractor using your own vehicle. We’ll ask for documents only if an admin advances your application.</p>
      </div>

      <section className="driver-apply-section">
        <div><span>01</span><strong>You</strong></div>
        <label>Legal full name<input required autoComplete="name" value={form.fullName} onChange={(event) => update("fullName", event.target.value)} placeholder="As shown on your licence" maxLength={80} /></label>
        <label>Mobile number<input required type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="(780) 555-0123" /></label>
        <small>We’ll text this number now and use it for secure driver sign-in if approved.</small>
        <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="you@example.com" maxLength={254} /></label>
        <label>Service area<input required value={form.serviceArea} onChange={(event) => update("serviceArea", event.target.value)} placeholder="Edmonton and nearby communities" maxLength={100} /></label>
      </section>

      <section className="driver-apply-section">
        <div><span>02</span><strong>Licence & vehicle</strong></div>
        <div className="driver-apply-grid">
          <label>Alberta licence class<select value={form.licenceClass} onChange={(event) => update("licenceClass", event.target.value)}>
            <option value="5">Class 5</option><option value="3">Class 3</option><option value="2">Class 2</option><option value="1">Class 1</option>
          </select></label>
          <label>Licence expiry<input required type="date" value={form.licenceExpiresOn} onChange={(event) => update("licenceExpiresOn", event.target.value)} /></label>
        </div>
        <label>Vehicle type<input required value={form.vehicleType} onChange={(event) => update("vehicleType", event.target.value)} placeholder="Pickup truck, cargo van…" maxLength={80} /></label>
        <div className="driver-apply-grid">
          <label>Axles<select value={form.axleCount} onChange={(event) => update("axleCount", event.target.value)}>
            {Array.from({ length: 9 }, (_, index) => index + 2).map((count) => <option key={count} value={count}>{count}</option>)}
          </select></label>
          <label>Registered GVW (kg)<input required type="number" min="500" max="100000" inputMode="numeric" value={form.registeredGvwKg} onChange={(event) => update("registeredGvwKg", event.target.value)} placeholder="e.g. 3500" /></label>
        </div>
        <label className="driver-check"><input type="checkbox" checked={form.hasTrailer} onChange={(event) => update("hasTrailer", event.target.checked)} /><span>I expect to use a trailer</span></label>
        <label className="driver-check"><input type="checkbox" checked={form.travelsOutsideAlberta} onChange={(event) => update("travelsOutsideAlberta", event.target.checked)} /><span>I expect to take jobs outside Alberta</span></label>
        {heavyVehicle && <p className="driver-regulatory-note"><b>Commercial-carrier review required.</b> This vehicle or travel plan may cross Alberta’s Safety Fitness Certificate and inspection thresholds.</p>}
      </section>

      <section className="driver-apply-section consent">
        <div><span>03</span><strong>Your confirmations</strong></div>
        <label className="driver-check"><input required type="checkbox" checked={form.legalWorkAttested} onChange={(event) => update("legalWorkAttested", event.target.checked)} /><span>I confirm I am legally able to work in Canada.</span></label>
        <label className="driver-check"><input required type="checkbox" checked={form.screeningConsented} onChange={(event) => update("screeningConsented", event.target.checked)} /><span>I consent to HAULWAY verifying my licence, driver abstract, registration, commercial insurance, WCB clearance, and business-licence status if my application advances.</span></label>
        <label className="driver-check"><input required type="checkbox" checked={form.privacyConsented} onChange={(event) => update("privacyConsented", event.target.checked)} /><span>I consent to this information being used to review and administer my driver application.</span></label>
        <p className="driver-privacy-note">HAULWAY collects only information reasonably needed to review your application. Approved reviewers can access it. Service providers may process information outside Canada. Ask for access or correction at {PRIVACY_CONTACT_EMAIL ? <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a> : "the HAULWAY privacy contact"}.</p>
      </section>

      <label className="driver-honeypot" aria-hidden="true">Company website<input tabIndex={-1} autoComplete="off" value={form.companyWebsite} onChange={(event) => update("companyWebsite", event.target.value)} /></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="hw-primary wide" disabled={busy}>{busy ? "Sending code…" : "Verify mobile & submit"}<span aria-hidden="true">→</span></button>
      <small className="driver-apply-foot">No application fee · Documents requested only after review</small>
    </form>}

    {step === "verify" && <form className="driver-verify-card" onSubmit={submitCode}>
      <span className="driver-verify-icon">•••</span>
      <span className="micro-label">SMS VERIFICATION</span>
      <h1>Check your messages.</h1>
      <p>Enter the six-digit code sent to <b>{form.phone}</b>. This confirms that the application belongs to you.</p>
      <label>Verification code<input className="op-code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="hw-primary wide" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Submit application"}<span aria-hidden="true">→</span></button>
      <button className="driver-text-button" type="button" onClick={() => { setStep("details"); setCode(""); setError(""); }}>Change application details</button>
    </form>}

    {step === "done" && <section className="driver-done-card">
      <span>✓</span>
      <small>APPLICATION RECEIVED</small>
      <h1>You’re in the review queue.</h1>
      <p>An administrator will review your details. If you advance, we’ll contact this verified number to check your documents. Approval is required before you can see any jobs.</p>
      <a className="hw-primary wide" href="/driver">Back to driver sign in<span aria-hidden="true">→</span></a>
    </section>}
  </main>;
}
