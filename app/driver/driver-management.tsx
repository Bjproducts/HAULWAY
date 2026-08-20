"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, readJson } from "../http";

export type ApprovedDriver = {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  active: boolean;
  suspendedAt: string | null;
  complianceExpiresOn: string;
  engagementType: "contractor" | "employee";
  vehicleSource: "own" | "company";
  vehicleType: string | null;
  serviceArea: string | null;
  licenceExpiresOn: string | null;
  abstractIssuedOn: string | null;
  commercialInsuranceExpiresOn: string | null;
  vehicleRegistrationExpiresOn: string | null;
  wcbClearanceCheckedOn: string | null;
  businessLicenceExpiresOn: string | null;
};

type DriverApplication = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  serviceArea: string;
  engagementType: "contractor" | "employee";
  vehicleSource: "own" | "company";
  vehicleType: string;
  axleCount: number;
  registeredGvwKg: number;
  hasTrailer: boolean;
  travelsOutsideAlberta: boolean;
  licenceClass: string;
  licenceExpiresOn: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

type AdminAccount = { id: string; displayName: string; email: string; active: boolean; isOwner: boolean; lastLoginAt: string | null; createdAt: string };
type AdminInvitation = { id: string; displayName: string; email: string; expiresAt: string; consumedAt: string | null; revokedAt: string | null; createdAt: string; pending: boolean };

type ReviewValues = {
  abstractIssuedOn: string;
  commercialInsuranceExpiresOn: string;
  vehicleRegistrationExpiresOn: string;
  wcbClearanceCheckedOn: string;
  businessLicenceExpiresOn: string;
  complianceConfirmed: boolean;
  rejectionReason: string;
};

type DriverComplianceValues = Omit<ReviewValues, "rejectionReason"> & { licenceExpiresOn: string };

const EMPTY_REVIEW: ReviewValues = {
  abstractIssuedOn: "",
  commercialInsuranceExpiresOn: "",
  vehicleRegistrationExpiresOn: "",
  wcbClearanceCheckedOn: "",
  businessLicenceExpiresOn: "",
  complianceConfirmed: false,
  rejectionReason: "",
};

export function DriverManagement({ isOwner, onPendingChange }: { isOwner: boolean; onPendingChange?: (count: number) => void }) {
  const [applications, setApplications] = useState<DriverApplication[]>([]);
  const [drivers, setDrivers] = useState<ApprovedDriver[]>([]);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [tab, setTab] = useState<"applications" | "drivers" | "admins">("applications");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewValues>(EMPTY_REVIEW);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [complianceDriverId, setComplianceDriverId] = useState<string | null>(null);
  const [driverCompliance, setDriverCompliance] = useState<DriverComplianceValues | null>(null);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const [applicationData, driverData, administratorData] = await Promise.all([
        operatorRequest("/api/driver/applications") as Promise<{ applications: DriverApplication[] }>,
        operatorRequest("/api/operators") as Promise<{ drivers: ApprovedDriver[] }>,
        isOwner
          ? operatorRequest("/api/operator/invitations") as Promise<{ admins: AdminAccount[]; invitations: AdminInvitation[] }>
          : Promise.resolve({ admins: [] as AdminAccount[], invitations: [] as AdminInvitation[] }),
      ]);
      setApplications(applicationData.applications);
      setDrivers(driverData.drivers);
      setAdmins(administratorData.admins);
      setInvitations(administratorData.invitations);
      onPendingChange?.(applicationData.applications.filter((entry) => entry.status === "pending").length);
    } catch (caught) { setError(errorMessage(caught)); }
  }, [isOwner, onPendingChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pending = useMemo(() => applications.filter((entry) => entry.status === "pending"), [applications]);
  const reviewed = useMemo(() => applications.filter((entry) => entry.status !== "pending"), [applications]);
  const selected = applications.find((entry) => entry.id === selectedId) ?? null;

  function choose(application: DriverApplication) {
    setSelectedId(application.id);
    setReview({ ...EMPTY_REVIEW, wcbClearanceCheckedOn: new Date().toISOString().slice(0, 10) });
    setError("");
  }

  async function approve(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy("approve"); setError("");
    try {
      await operatorRequest(`/api/driver/applications/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "approve", ...review }),
      });
      setSelectedId(null); setReview(EMPTY_REVIEW); await load();
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(""); }
  }

  async function reject() {
    if (!selected) return;
    setBusy("reject"); setError("");
    try {
      await operatorRequest(`/api/driver/applications/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "reject", rejectionReason: review.rejectionReason }),
      });
      setSelectedId(null); setReview(EMPTY_REVIEW); await load();
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(""); }
  }

  async function setDriverActive(driver: ApprovedDriver, active: boolean) {
    setBusy(driver.id); setError("");
    try {
      await operatorRequest(`/api/operators/${driver.id}`, { method: "PATCH", body: JSON.stringify({ action: active ? "reactivate" : "suspend" }) });
      await load();
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(""); }
  }

  function editCompliance(driver: ApprovedDriver) {
    setComplianceDriverId(driver.id);
    setDriverCompliance({
      licenceExpiresOn: driver.licenceExpiresOn ?? "",
      abstractIssuedOn: driver.abstractIssuedOn ?? "",
      commercialInsuranceExpiresOn: driver.commercialInsuranceExpiresOn ?? "",
      vehicleRegistrationExpiresOn: driver.vehicleRegistrationExpiresOn ?? "",
      wcbClearanceCheckedOn: new Date().toISOString().slice(0, 10),
      businessLicenceExpiresOn: driver.businessLicenceExpiresOn ?? "",
      complianceConfirmed: false,
    });
    setError("");
  }

  async function refreshCompliance(event: FormEvent, driver: ApprovedDriver) {
    event.preventDefault();
    if (!driverCompliance) return;
    setBusy(`compliance-${driver.id}`); setError("");
    try {
      await operatorRequest(`/api/operators/${driver.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "refresh_compliance", ...driverCompliance }),
      });
      setComplianceDriverId(null); setDriverCompliance(null); await load();
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(""); }
  }

  async function createAdminInvitation(event: FormEvent) {
    event.preventDefault(); setBusy("invite"); setError(""); setInvitationUrl("");
    try {
      const data = await operatorRequest("/api/operator/invitations", { method: "POST", body: JSON.stringify({ displayName: adminName, email: adminEmail }) }) as { invitation: { url: string } };
      setInvitationUrl(data.invitation.url); setAdminName(""); setAdminEmail(""); await load();
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(""); }
  }

  async function revokeInvitation(id: string) {
    setBusy(id); setError("");
    try { await operatorRequest(`/api/operator/invitations/${id}`, { method: "DELETE" }); await load(); }
    catch (caught) { setError(errorMessage(caught)); } finally { setBusy(""); }
  }

  async function setAdminActive(admin: AdminAccount, active: boolean) {
    setBusy(admin.id); setError("");
    try { await operatorRequest(`/api/operator/admins/${admin.id}`, { method: "PATCH", body: JSON.stringify({ action: active ? "reactivate" : "suspend" }) }); await load(); }
    catch (caught) { setError(errorMessage(caught)); } finally { setBusy(""); }
  }

  if (selected) return <main className="driver-admin-review">
    <button className="driver-admin-back" onClick={() => setSelectedId(null)}>← Applications</button>
    <div className="driver-review-title"><span className="status-pill requested">SMS verified</span><h2>{selected.fullName}</h2><p>{selected.email} · {selected.phone}</p></div>
    <dl className="driver-review-facts">
      <div><dt>Service area</dt><dd>{selected.serviceArea}</dd></div>
      <div><dt>Vehicle</dt><dd>{selected.vehicleType} · {selected.axleCount} axles · {selected.registeredGvwKg.toLocaleString()} kg GVW</dd></div>
      <div><dt>Licence</dt><dd>Alberta Class {selected.licenceClass} · expires {friendlyDate(selected.licenceExpiresOn)}</dd></div>
      <div><dt>Operation</dt><dd>Independent contractor · own vehicle{selected.hasTrailer ? " · trailer" : ""}{selected.travelsOutsideAlberta ? " · may leave Alberta" : ""}</dd></div>
    </dl>
    {(selected.registeredGvwKg >= 11794 || (selected.travelsOutsideAlberta && selected.registeredGvwKg > 4500)) && <p className="driver-review-alert"><b>Commercial-carrier threshold flagged.</b> Confirm the required Safety Fitness Certificate and inspection before approval.</p>}

    <form className="driver-compliance-form" onSubmit={approve}>
      <div><span className="micro-label">OWNER/ADMIN CHECK</span><h3>Record verified compliance</h3><p>Review originals or authoritative records. Store outcomes and expiries—not document images.</p></div>
      <label>Driver abstract issue date<input required type="date" value={review.abstractIssuedOn} onChange={(event) => setReview((current) => ({ ...current, abstractIssuedOn: event.target.value }))} /><small>Must be issued within the last 60 days.</small></label>
      <label>Commercial insurance expiry<input required type="date" value={review.commercialInsuranceExpiresOn} onChange={(event) => setReview((current) => ({ ...current, commercialInsuranceExpiresOn: event.target.value }))} /></label>
      <label>Vehicle registration expiry<input required type="date" value={review.vehicleRegistrationExpiresOn} onChange={(event) => setReview((current) => ({ ...current, vehicleRegistrationExpiresOn: event.target.value }))} /></label>
      <label>WCB clearance checked<input required type="date" value={review.wcbClearanceCheckedOn} onChange={(event) => setReview((current) => ({ ...current, wcbClearanceCheckedOn: event.target.value }))} /><small>Must be checked within the last 30 days and refreshed regularly.</small></label>
      <label>Edmonton business licence expiry<input required type="date" value={review.businessLicenceExpiresOn} onChange={(event) => setReview((current) => ({ ...current, businessLicenceExpiresOn: event.target.value }))} /></label>
      <label className="driver-check"><input required type="checkbox" checked={review.complianceConfirmed} onChange={(event) => setReview((current) => ({ ...current, complianceConfirmed: event.target.checked }))} /><span>I verified the licence, abstract, commercial-use insurance, registration, WCB clearance, and Edmonton business licence.</span></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="op-accept" disabled={Boolean(busy)}>{busy === "approve" ? "Approving…" : "Approve & enable SMS sign-in"}<span>→</span></button>
    </form>

    <section className="driver-reject-box">
      <label>Internal rejection note<textarea maxLength={500} value={review.rejectionReason} onChange={(event) => setReview((current) => ({ ...current, rejectionReason: event.target.value }))} placeholder="Optional—do not include unnecessary sensitive information" /></label>
      <button disabled={Boolean(busy)} onClick={() => void reject()}>{busy === "reject" ? "Rejecting…" : "Reject application"}</button>
    </section>
  </main>;

  return <main className="driver-admin">
    <div className={`driver-admin-tabs ${isOwner ? "three" : ""}`} role="tablist">
      <button role="tab" aria-selected={tab === "applications"} className={tab === "applications" ? "active" : ""} onClick={() => setTab("applications")}>Applications<i>{pending.length}</i></button>
      <button role="tab" aria-selected={tab === "drivers"} className={tab === "drivers" ? "active" : ""} onClick={() => setTab("drivers")}>Drivers<i>{drivers.length}</i></button>
      {isOwner && <button role="tab" aria-selected={tab === "admins"} className={tab === "admins" ? "active" : ""} onClick={() => setTab("admins")}>Admins<i>{admins.length}</i></button>}
    </div>
    {error && <p className="op-error">{error}<button onClick={() => setError("")}>×</button></p>}

    {tab === "applications" && <>
      <div className="driver-admin-heading"><span className="micro-label">REVIEW QUEUE</span><h2>{pending.length ? `${pending.length} waiting` : "You’re caught up"}</h2><p>Phone ownership is already verified. Check business and vehicle records before approval.</p></div>
      <div className="driver-application-list">
        {pending.map((application) => <button key={application.id} onClick={() => choose(application)}>
          <span><strong>{application.fullName}</strong><small>{application.vehicleType} · Class {application.licenceClass}</small></span><i>→</i>
        </button>)}
        {!pending.length && <div className="op-empty"><span>✓</span><strong>No applications waiting.</strong><small>New SMS-verified applications will appear here.</small></div>}
      </div>
      {reviewed.length > 0 && <details className="driver-reviewed"><summary>Recently reviewed · {reviewed.length}</summary>{reviewed.slice(0, 20).map((entry) => <div key={entry.id}><span><b>{entry.fullName}</b><small>{entry.reviewedAt ? friendlyDate(entry.reviewedAt) : ""}</small></span><i className={entry.status}>{entry.status}</i></div>)}</details>}
    </>}

    {tab === "drivers" && <>
      <div className="driver-admin-heading"><span className="micro-label">APPROVED FLEET</span><h2>{drivers.filter((driver) => driver.active).length} active</h2><p>Only active drivers with current compliance can sign in or receive assignments.</p></div>
      <div className="driver-list">
        {drivers.map((driver) => <article key={driver.id}>
          <div><span className={`driver-live ${driver.active ? "active" : ""}`} /><span><strong>{driver.displayName}</strong><small>{driver.vehicleType ?? "Vehicle not recorded"} · {driver.serviceArea ?? "Area not recorded"}</small></span></div>
          <dl><div><dt>Phone</dt><dd>{driver.phone}</dd></div><div><dt>Compliance</dt><dd>{friendlyDate(driver.complianceExpiresOn)}</dd></div></dl>
          <div className="driver-account-actions">
            <button disabled={Boolean(busy)} className="compliance" onClick={() => editCompliance(driver)}>Update compliance</button>
            <button disabled={busy === driver.id} className={driver.active ? "suspend" : "reactivate"} onClick={() => void setDriverActive(driver, !driver.active)}>{busy === driver.id ? "Updating…" : driver.active ? "Suspend access" : "Reactivate"}</button>
          </div>
          {complianceDriverId === driver.id && driverCompliance && <form className="driver-inline-compliance" onSubmit={(event) => void refreshCompliance(event, driver)}>
            <strong>Refresh verified records</strong>
            <label>Licence expiry<input required type="date" value={driverCompliance.licenceExpiresOn} onChange={(event) => setDriverCompliance((current) => current && ({ ...current, licenceExpiresOn: event.target.value }))} /></label>
            <label>Driver abstract issued<input required type="date" value={driverCompliance.abstractIssuedOn} onChange={(event) => setDriverCompliance((current) => current && ({ ...current, abstractIssuedOn: event.target.value }))} /></label>
            <label>Commercial insurance expiry<input required type="date" value={driverCompliance.commercialInsuranceExpiresOn} onChange={(event) => setDriverCompliance((current) => current && ({ ...current, commercialInsuranceExpiresOn: event.target.value }))} /></label>
            <label>Registration expiry<input required type="date" value={driverCompliance.vehicleRegistrationExpiresOn} onChange={(event) => setDriverCompliance((current) => current && ({ ...current, vehicleRegistrationExpiresOn: event.target.value }))} /></label>
            <label>WCB clearance checked<input required type="date" value={driverCompliance.wcbClearanceCheckedOn} onChange={(event) => setDriverCompliance((current) => current && ({ ...current, wcbClearanceCheckedOn: event.target.value }))} /></label>
            <label>Business licence expiry<input required type="date" value={driverCompliance.businessLicenceExpiresOn} onChange={(event) => setDriverCompliance((current) => current && ({ ...current, businessLicenceExpiresOn: event.target.value }))} /></label>
            <label className="driver-check"><input required type="checkbox" checked={driverCompliance.complianceConfirmed} onChange={(event) => setDriverCompliance((current) => current && ({ ...current, complianceConfirmed: event.target.checked }))} /><span>I re-verified every record.</span></label>
            <div><button type="button" onClick={() => { setComplianceDriverId(null); setDriverCompliance(null); }}>Cancel</button><button disabled={Boolean(busy)}>{busy === `compliance-${driver.id}` ? "Saving…" : "Save review"}</button></div>
          </form>}
        </article>)}
        {!drivers.length && <div className="op-empty"><span>H</span><strong>No approved drivers yet.</strong><small>Approve a verified application to create the first driver account.</small></div>}
      </div>
    </>}

    {tab === "admins" && isOwner && <>
      <div className="driver-admin-heading"><span className="micro-label">OWNER CONTROL</span><h2>Individual admin access</h2><p>Create a one-time invitation for your partner. Never send a password or authenticator key.</p></div>
      <form className="admin-invite-form" onSubmit={createAdminInvitation}>
        <label>Administrator name<input required value={adminName} onChange={(event) => setAdminName(event.target.value)} maxLength={80} placeholder="Partner’s full name" /></label>
        <label>Administrator email<input required type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} maxLength={254} placeholder="partner@d-load.ca" /></label>
        <button className="op-accept" disabled={Boolean(busy)}>{busy === "invite" ? "Creating…" : "Create 24-hour invitation"}<span>→</span></button>
      </form>
      {invitationUrl && <div className="admin-invite-secret"><span className="micro-label">SHOWN ONCE</span><strong>Send this link privately</strong><code>{invitationUrl}</code><button onClick={() => void navigator.clipboard.writeText(invitationUrl)}>Copy invitation link</button><small>The link expires in 24 hours and becomes invalid after use.</small></div>}
      <div className="admin-account-list">
        {admins.map((admin) => <article key={admin.id}>
          <div><span className={`driver-live ${admin.active ? "active" : ""}`} /><span><strong>{admin.displayName}</strong><small>{admin.email}</small></span>{admin.isOwner && <i>Owner</i>}</div>
          <small>{admin.lastLoginAt ? `Last sign-in ${friendlyDate(admin.lastLoginAt)}` : "Has not signed in yet"}</small>
          {!admin.isOwner && <button disabled={busy === admin.id} onClick={() => void setAdminActive(admin, !admin.active)}>{busy === admin.id ? "Updating…" : admin.active ? "Suspend admin" : "Reactivate admin"}</button>}
        </article>)}
      </div>
      {invitations.some((invite) => invite.pending) && <section className="admin-pending-invites"><strong>Pending invitations</strong>{invitations.filter((invite) => invite.pending).map((invite) => <div key={invite.id}><span><b>{invite.displayName}</b><small>{invite.email} · expires {friendlyDate(invite.expiresAt)}</small></span><button disabled={busy === invite.id} onClick={() => void revokeInvitation(invite.id)}>Revoke</button></div>)}</section>}
    </>}
  </main>;
}

async function operatorRequest(input: string, init: RequestInit = {}) {
  return fetch(input, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", "x-haulway-role": "operator", ...init.headers } }).then(readJson);
}

function friendlyDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
