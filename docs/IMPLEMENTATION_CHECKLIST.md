# HAULWAY implementation checklist

Last updated: August 21, 2026

## Current owner-operated launch decision

- [x] Remove the public driver application from the product.
- [x] Remove driver SMS sign-in and invalidate legacy driver sessions.
- [x] Remove driver assignment and driver-management controls from the owner portal.
- [x] Restrict every operator-side job action to administrators.
- [x] Keep accept, quote, ETA, arrival swipe, chat, completion, and payment controls in the owners-only portal.
- [x] Keep legacy driver tables dormant instead of destructively changing production data.

The older driver workflow sections below are retained as implementation history and future planning material; those features are not enabled in the launch product.

This checklist separates work completed and verified in the prepared code from production actions that still require credentials, provider configuration, a coordinated database migration, or owner approval.

## Customer booking and request experience

- [x] Store customer requests and request updates in Supabase instead of browser-only state.
- [x] Permit only one active booking per customer at a time.
- [x] Keep a customer focused on the active request until it reaches a terminal state.
- [x] Redirect the customer to the active tracking screen after a driver accepts the request.
- [x] Restore the progress-first journey showing booking, review, ETA, arrival, work, and completion states.
- [x] Keep chat optional instead of opening it as the main tracking experience.
- [x] Display request updates as designed in-app notifications.
- [x] Extend notification visibility while keeping the dismissal animation smooth and timer-free.
- [x] Show a whole-minute ETA countdown without displaying seconds.
- [x] Update the customer screen when the driver changes the ETA.
- [x] Show a clear “Driver arrived” state after the driver confirms arrival.
- [x] Use a swipe gesture for customer completion confirmation.
- [x] Ask for a rating after completion and allow the customer to skip it.
- [x] Return the customer to the home screen after rating or skipping.
- [x] Add address-building options, including Apartment and Other.
- [x] Reveal a unit field for Apartment.
- [x] Reveal a free-text field when Other is selected.
- [x] Remove the driver photograph from the final tracker screen.
- [x] Remove the “Payment only unlocks after both sides confirm” copy.
- [x] Centre the completion heading and confirmation area.
- [x] Compact the tracking experience to reduce unnecessary scrolling.

## Driver job workflow

- [x] Provide a separate driver portal.
- [x] Keep the desktop driver portal centred and within the visible viewport.
- [x] Restrict drivers to jobs explicitly assigned to them.
- [x] Let an assigned driver set an initial ETA.
- [x] Let an assigned driver revise the active ETA.
- [x] Add a swipe-to-confirm “I have arrived” control.
- [x] Persist arrival so the customer receives the update across devices.
- [x] Let assigned drivers send job chat messages.
- [x] Let assigned drivers participate in completion confirmation.
- [x] Preserve administrator-only control over accepting requests, sending quotes, payment acknowledgement, and driver assignment.

## Driver application and independent-contractor onboarding

- [x] Add a public driver application flow.
- [x] Make independent contractor and own vehicle the current defaults.
- [x] Store engagement type and vehicle source separately so employees, company vehicles, or a mixed fleet can be supported later.
- [x] Verify control of the applicant’s mobile number with a Supabase SMS one-time code before storing the application.
- [x] Keep pending applicants outside the operator portal and job queue.
- [x] Collect only minimum first-stage screening information.
- [x] Avoid collecting a SIN, driver’s-licence number, or licence image in the public application.
- [x] Collect service area, vehicle type, axle count, registered GVW, trailer use, licence class, and licence expiry.
- [x] Flag applications that may cross commercial-carrier weight or extra-provincial thresholds.
- [x] Collect legal-work, screening, and privacy consent attestations.
- [x] Add a privacy collection notice and configurable privacy contact.
- [x] Add administrator application review and rejection controls.
- [x] Require recorded licence, driver abstract, commercial-use insurance, registration, WCB, and Edmonton business-licence checks before approval.
- [x] Store verification outcomes and expiry dates rather than indefinitely retaining document images.
- [x] Create the driver account atomically only after approval.
- [x] Notify the applicant of the decision by SMS.
- [x] Enforce compliance expiry during driver sign-in and assignment.
- [x] Add driver suspension, reactivation, and compliance-refresh controls.
- [x] Immediately invalidate sessions when a driver is suspended.
- [x] Document Alberta, Edmonton, WCB, privacy, and contractor-screening considerations.

## Driver authentication

- [x] Use passwordless SMS verification for approved drivers.
- [x] Send login codes only to approved, active, non-suspended drivers with current compliance.
- [x] Return generic responses that do not reveal whether a phone number is registered.
- [x] Bind driver sessions to the approved Supabase phone identity.
- [x] Apply phone, IP, and purpose-specific rate limits to SMS requests.
- [x] Add a honeypot to the public driver application.

## Owner and administrator access

- [ ] Replace the temporary owners-only shared administrator passphrase with named accounts (deferred by owner for launch).
- [x] Create one database-enforced owner account.
- [ ] Require named administrator passphrases and authenticator-app TOTP (deferred by owner for launch).
- [x] Encrypt TOTP secrets at rest.
- [x] Keep replay-protected TOTP support ready for the post-launch named-account migration.
- [ ] Give the partner a separate administrator account instead of shared credentials (post-launch owner decision).
- [x] Restrict administrator creation, suspension, reactivation, and access management to the owner.
- [x] Let regular administrators manage operations and driver reviews without managing administrator access.
- [x] Add 24-hour, single-use administrator invitations.
- [x] Store invitation-token hashes instead of reusable plaintext tokens.
- [x] Require the invited administrator to create their own passphrase and authenticator enrollment.
- [x] Add owner-facing administrator and pending-invitation screens.
- [x] Immediately invalidate administrator sessions after suspension.
- [x] Prevent the owner from accidentally suspending the sole owner account.

## Customer authentication and authorization

- [x] Require a valid Supabase SMS OTP for customer access.
- [x] Disable the insecure direct-auth fallback with HTTP 410.
- [x] Restrict customers to their own requests, messages, and media.
- [x] Return safe public errors without database or credential details.
- [x] Validate mutation origins to reduce cross-site request attacks.
- [x] Enforce request-body size limits.
- [x] Apply durable database-backed rate limits.

## Sessions and API security

- [x] Add separate customer, administrator, and driver authorization paths.
- [x] Apply role checks on privileged API actions.
- [x] Rotate sessions after privileged authentication.
- [x] Bind privileged sessions to device evidence.
- [x] Enforce a 30-minute operator idle timeout.
- [x] Enforce an eight-hour absolute operator-session lifetime.
- [x] Invalidate sessions when an operator is suspended or removed.
- [x] Use optimistic concurrency checks to stop stale job actions overwriting newer state.
- [x] Record immutable audit events for privileged actions.
- [x] Audit driver review, assignment, suspension, compliance, payment, and administrator-access changes.

## Database and Supabase hardening

- [x] Add launch-security, driver-onboarding, and administrator-invitation migrations.
- [x] Add row-level security and revoke direct anonymous/authenticated access to privileged tables.
- [x] Keep privileged database operations behind server-side service-role access and security-definer RPCs.
- [x] Add database constraints for roles, application states, vehicle source, engagement type, and SMS ownership targets.
- [x] Make driver approval and account creation atomic.
- [x] Lock application and invitation records during approval or acceptance to prevent duplicate use.
- [x] Enforce only one owner through a database invariant.
- [x] Add cleanup support for expired sessions, abandoned uploads, and retained security data.

## Upload and media protection

- [x] Keep uploaded job media in private Supabase Storage.
- [x] Require a server-side access check before returning a short-lived signed URL.
- [x] Verify actual file signatures instead of trusting the browser-declared MIME type.
- [x] Quarantine uploads until validation succeeds.
- [x] Reject and remove files whose bytes do not match an allowed media type.
- [x] Limit upload sizes and accepted content types.

## SMS and request notifications

- [x] Add a durable SMS outbox rather than relying only on a single live provider request.
- [x] Queue request receipt, acceptance, ETA, ETA-change, arrival, quote, chat, completion, and payment updates.
- [x] Use the same audited outbox for driver-application decisions.
- [x] Add retry support for unsent or failed messages.
- [x] Add a Twilio delivery-status webhook.
- [x] Verify Twilio webhook signatures before accepting delivery updates.
- [x] Record delivered, failed, and undelivered outcomes.
- [x] Keep Twilio credentials server-side and support restricted API-key sending.

## Interface and responsive-quality fixes

- [x] Improve visual hierarchy across booking, tracking, completion, authentication, and management flows.
- [x] Add consistent motion and transition behaviour without displaying artificial countdown timers.
- [x] Keep interactive controls at accessible touch-target sizes.
- [x] Improve text and surface contrast on the driver application.
- [x] Prevent horizontal overflow on the tested mobile application viewport.
- [x] Verify desktop centring of the operator portal.
- [x] Add responsive driver application, SMS sign-in, review, compliance, and administrator-management interfaces.

## Verification completed

- [x] Next.js production build succeeds.
- [x] TypeScript validation succeeds as part of the production build.
- [x] ESLint succeeds.
- [x] Fourteen automated security and workflow tests pass.
- [x] Dependency audit reports zero known production vulnerabilities.
- [x] Git diff whitespace validation succeeds.
- [x] Driver application visually checked in the local browser at desktop and mobile sizes.
- [x] Driver SMS sign-in visually checked in the local browser.
- [x] Desktop portal centring and horizontal-overflow checks pass.

## Production actions still required

- [ ] Confirm final contractor agreements, insurance limits, WCB handling, business licensing, prohibited materials, and retention periods with qualified Alberta advisers and the relevant providers.
- [ ] Establish a monitored privacy-contact email and written privacy/retention procedures.
- [ ] Enable and verify Supabase database backups before migration.
- [x] Configure the production `haulway.ca` domain and TLS on the selected Netlify site.
- [x] Add every required Netlify environment variable from the deployment guide.
- [x] Top up Twilio and configure a production sender or Messaging Service.
- [x] Create a restricted Twilio API key and configure the signed status-callback URL.
- [x] Configure Supabase Phone Auth with the production SMS provider and review OTP limits.
- [x] Implement server-validated Cloudflare Turnstile protection in front of public SMS requests.
- [ ] Configure the production Turnstile site and secret keys in Netlify and verify the two live hostnames.
- [ ] Implement a reviewed administrator account-recovery process that cannot bypass MFA.
- [ ] Put the current site into a short maintenance window.
- [ ] Apply all Supabase migrations in filename order.
- [ ] Deploy the matching application build immediately after the migrations.
- [ ] Bootstrap the named owner account, then remove the temporary setup token and redeploy.
- [ ] Create the partner’s invitation from the owner account and deliver it privately.
- [ ] Run database-backed end-to-end authorization tests for every role and suspension state.
- [ ] Test one complete production customer-to-driver request, including every SMS update and delivery callback.
- [ ] Test backup restoration outside production.
- [ ] Establish monitoring and an incident-response contact process.

## Current deployment warning

The prepared application expects the new database schema. The current Supabase project has not yet received these migrations and currently reports missing operator-security columns. Do not deploy the prepared application independently of its migrations, and do not apply the migrations while an older application build is still expected to serve operator traffic.
