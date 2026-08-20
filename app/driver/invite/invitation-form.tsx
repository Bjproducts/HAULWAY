"use client";

import { FormEvent, useEffect, useState } from "react";
import { errorMessage, readJson } from "../../http";

export function AdminInvitationForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [totpSecret] = useState(generateTotpSecret);
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(token ? "" : "This invitation link is incomplete.");

  useEffect(() => {
    // Remove the bearer token from the address bar and future same-origin
    // referrers once the server has handed it to this isolated client form.
    if (token) window.history.replaceState(null, "", "/driver/invite");
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirm) return setError("The passphrases do not match.");
    setBusy(true);
    try {
      await fetch("/api/operator/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, totpSecret, totpCode }),
      }).then(readJson);
      setDone(true);
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  return <main className="op-gate">
    <div className="op-gate-top"><span className="op-logo"><span className="op-mark">H</span><span><b>HAULWAY</b><small>ADMIN INVITATION</small></span></span></div>
    {done ? <section className="op-gate-sheet admin-invite-done">
      <span className="op-gate-icon">✓</span><span className="micro-label">ACCOUNT SECURED</span><h1>Welcome to HAULWAY.</h1><p>Your named administrator account is active. This invitation cannot be used again.</p><a className="hw-primary wide" href="/driver">Open admin portal <span>→</span></a>
    </section> : <form className="op-gate-sheet" onSubmit={submit}>
      <span className="op-gate-icon">A</span>
      <span className="micro-label">PRIVATE ADMIN INVITATION</span>
      <h1>Create your own secure access.</h1>
      <p>Use a unique passphrase and add HAULWAY to your authenticator app. Never share this account with another person.</p>
      <label>Create passphrase<input required type="password" autoComplete="new-password" minLength={14} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 14 characters" /></label>
      <label>Confirm passphrase<input required type="password" autoComplete="new-password" minLength={14} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Repeat your passphrase" /></label>
      <div className="op-mfa-setup"><strong>Add HAULWAY to your authenticator app</strong><p>Choose “enter setup key,” name it HAULWAY, then enter this key:</p><code>{totpSecret}</code></div>
      <label>Authenticator code<input required className="op-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="hw-primary wide" disabled={busy || !token || password.length < 14 || totpCode.length !== 6}>{busy ? "Securing account…" : "Accept invitation"}<span>→</span></button>
      <span className="op-gate-trust">Single-use invitation · MFA required · Individual access</span>
    </form>}
  </main>;
}

function generateTotpSecret() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) result += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return result;
}
