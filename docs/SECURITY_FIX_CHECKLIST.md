# HAULWAY security-fix checklist

Last updated: August 21, 2026

## Current owner-operated launch controls

- [x] Driver application and SMS authentication routes return HTTP 410 and create no account or session.
- [x] Legacy driver sessions fail hydration and are deleted.
- [x] Driver-management endpoints return HTTP 410.
- [x] The job-assignment action returns HTTP 410.
- [x] Only active administrator sessions can access or mutate the operator side of any job.
- [x] Administrator cancellation is authorized server-side, confirmed in the interface, and written to the audit log.
- [x] Stale booking locks can be released without deleting the request or bypassing the one-active-haul database invariant.
- [x] Twilio and stored-media network calls have strict time limits; failed SMS remains in the durable outbox for retry.

Driver controls listed later in this document describe the dormant, previously prepared fleet model and are not enabled for launch.

Legend:

- `[x]` Implemented in the prepared code.
- `[ ]` Still requires production configuration, deployment, credentials, or business approval.

## Authentication

- [x] Removed the insecure direct customer-authentication fallback.
- [x] The removed direct-auth route returns HTTP 410 and creates no session.
- [x] Require a valid Supabase SMS one-time code before creating a customer session.
- [x] Require verified SMS ownership before storing a driver application.
- [x] Use passwordless SMS one-time codes for approved driver sign-in.
- [x] Restrict driver login codes to approved, active, non-suspended drivers with current compliance.
- [x] Use generic SMS-request responses so attackers cannot discover registered phone numbers.
- [ ] Replace the temporary owners-only shared administrator passphrase with individually named accounts (deferred by owner for launch).
- [ ] Rotate the shared `OPERATOR_PASSWORD` to a unique 20+ character value and keep it owners-only.
- [ ] Require authenticator-app TOTP MFA for administrators (deferred by owner for launch).
- [x] Encrypt administrator TOTP secrets at rest.
- [x] Preserve authenticator replay protection for the post-launch named-account migration.
- [x] Bind driver sessions to the approved Supabase phone identity.
- [ ] Validate each administrator's email identity after named accounts are enabled.

## Roles and authorization

- [x] Separate customer, driver, administrator, and owner authorization paths.
- [x] Enforce only one owner through a database invariant.
- [x] Restrict administrator creation and access management to the owner.
- [x] Prevent regular administrators from creating, suspending, or reactivating administrators.
- [x] Prevent the owner from accidentally suspending the sole owner account.
- [x] Restrict customers to their own jobs, messages, and media.
- [x] Restrict drivers to jobs assigned to their operator ID.
- [x] Prevent pending, rejected, suspended, or expired-compliance drivers from accessing jobs.
- [x] Restrict driver assignment to administrators.
- [x] Reject assignment of suspended or non-compliant drivers.
- [x] Keep quote creation, request approval, and payment acknowledgement administrator-only.
- [x] Enforce role checks inside server routes instead of relying on hidden interface controls.

## Administrator invitations

- [x] Add owner-only administrator invitations.
- [x] Generate high-entropy invitation tokens.
- [x] Store only the cryptographic hash of each invitation token.
- [x] Make invitations single-use.
- [x] Expire invitations after 24 hours.
- [x] Lock invitation records during acceptance to prevent duplicate use.
- [x] Require the original inviter to remain an active owner.
- [x] Require invited administrators to create their own passphrase and TOTP enrollment.
- [x] Add owner-only invitation revocation.
- [x] Add owner-only administrator suspension and reactivation.
- [x] Invalidate administrator sessions immediately after suspension.

## Session security

- [x] Rotate sessions after privileged authentication.
- [x] Bind privileged sessions to device evidence.
- [x] Enforce a 30-minute operator idle timeout.
- [x] Enforce an eight-hour absolute operator-session lifetime.
- [x] Invalidate all sessions when an operator is suspended.
- [x] Store only session-token hashes in the database.
- [x] Use secure, HTTP-only, same-site cookies for application sessions.
- [x] Add cleanup for expired sessions.

## Request and API protection

- [x] Validate mutation request origins to reduce CSRF attacks.
- [x] Enforce JSON request-body size limits.
- [x] Add durable database-backed rate limiting.
- [x] Add separate phone, IP, and action limits for OTP requests and verification.
- [x] Add rate limits to administrator login, setup, and invitation acceptance.
- [x] Add a honeypot to the public driver application.
- [x] Return sanitized public errors without database, secret, or stack details.
- [x] Use optimistic concurrency checks to stop stale job actions overwriting newer state.
- [x] Validate and normalize driver application inputs server-side.
- [x] Validate compliance dates before driver approval or renewal.
- [x] Fail closed when required secrets or security configuration are invalid.
- [x] Validate every production-critical environment variable before Netlify can publish a replacement deployment.
- [x] Track applied database migrations and expose schema drift through the health endpoint.
- [x] Disable destructive draft/media retention until the owners approve and configure an explicit window.

## Database security

- [x] Add a launch security-hardening migration.
- [x] Add a driver onboarding and compliance migration.
- [x] Add an owner-controlled administrator-invitation migration.
- [x] Enable row-level security on privileged driver and compliance tables.
- [x] Revoke direct anonymous and authenticated access to privileged tables.
- [x] Keep privileged database access behind server-side service-role operations.
- [x] Use security-definer RPCs for atomic privileged workflows.
- [x] Make driver approval and account creation one atomic transaction.
- [x] Lock driver applications during review to prevent conflicting decisions.
- [x] Add database constraints for operator roles, application states, engagement type, vehicle source, and SMS targets.
- [x] Add unique constraints for phone identities, Supabase identities, application ownership, and operator invitations.
- [x] Remove legacy shared-PIN verifier support in the prepared migration.

## Audit and accountability

- [x] Add immutable security audit events.
- [x] Prevent application roles from editing or deleting audit records.
- [x] Audit administrator login and SMS driver MFA authentication.
- [x] Audit driver approval and rejection.
- [x] Audit driver assignment, suspension, reactivation, and compliance refresh.
- [x] Audit administrator invitation, acceptance, revocation, suspension, and reactivation.
- [x] Audit privileged job, completion, and payment actions.
- [x] Record actor, target, action, timestamp, and security evidence needed for investigation.

## Upload and storage security

- [x] Keep job uploads in private Supabase Storage.
- [x] Require server-side authorization before returning media.
- [x] Return only short-lived signed media URLs after access checks.
- [x] Enforce upload-size and allowed-type restrictions.
- [x] Verify file signatures instead of trusting browser-declared MIME types.
- [x] Quarantine uploads until validation succeeds.
- [x] Reject and remove files whose contents do not match an allowed media type.
- [x] Add cleanup for abandoned uploads.

## SMS and Twilio security

- [x] Keep all Twilio credentials in server-only environment variables.
- [x] Support restricted Twilio API-key credentials for sending.
- [x] Add a durable SMS outbox with retry tracking.
- [x] Add a Twilio delivery-status callback endpoint.
- [x] Verify Twilio callback signatures before updating message status.
- [x] Reject unsigned or invalidly signed delivery callbacks.
- [x] Track delivered, failed, and undelivered outcomes.
- [x] Prevent SMS records from being attached to multiple business targets.
- [x] Avoid exposing Twilio or Supabase secret keys to browser code.

## Driver data and privacy security

- [x] Keep pending applicants out of the operator session and job queue.
- [x] Minimize information collected in the public application.
- [x] Do not collect SINs, licence numbers, or licence images in the public application.
- [x] Require legal-work, screening, and privacy consent attestations.
- [x] Add a configurable privacy-contact address.
- [x] Store compliance verification outcomes and expiry dates instead of permanent document copies.
- [x] Automatically block sign-in and assignment when driver compliance expires.
- [x] Immediately revoke access when a driver is suspended.
- [x] Document access, correction, retention, and breach-response responsibilities.

## Secrets and production configuration

- [x] Document separate secrets for rate limiting and security fingerprinting.
- [x] Document a dedicated 32-byte administrator MFA encryption key.
- [x] Document a temporary owner setup token that must be removed after bootstrap.
- [x] Document restricted Supabase and Twilio credential handling.
- [x] Prevent security secrets from using `NEXT_PUBLIC_` environment-variable names.
- [x] Add a complete Netlify security environment checklist.
- [x] Add a coordinated migration and deployment runbook.
- [x] Add incident-response instructions for compromised administrator access.

## Security verification completed

- [x] Production Next.js build passes.
- [x] TypeScript validation passes.
- [x] ESLint passes.
- [x] Fourteen automated security and workflow tests pass.
- [x] TOTP verification matches the RFC 6238 test vector.
- [x] TOTP-secret encryption and decryption round-trip test passes.
- [x] File-signature validation test passes.
- [x] Customer SMS-only access test passes.
- [x] Driver isolation and compliance test passes.
- [x] Owner-only administrator invitation test passes.
- [x] Dependency audit reports zero known production vulnerabilities.
- [x] Git whitespace validation passes.

## Production security work still required

- [ ] Enable and verify Supabase database backups.
- [x] Confirm `haulway.ca` TLS and canonical-domain configuration.
- [x] Add the documented security environment variables to Netlify.
- [ ] Generate and securely back up the production MFA encryption key.
- [ ] Generate a temporary owner setup token using a secure random source.
- [x] Top up Twilio and configure a production Messaging Service or sender.
- [x] Create a restricted Twilio API key.
- [x] Store the Twilio Auth Token for signed webhook verification.
- [x] Configure and test the production Twilio callback URL.
- [x] Configure Supabase Phone Auth with the production SMS provider.
- [x] Implement action- and hostname-bound Cloudflare Turnstile validation for public SMS requests.
- [ ] Add the production Turnstile keys to Netlify and test real challenges on both public hostnames.
- [ ] Implement an administrator recovery process that cannot bypass MFA.
- [ ] Apply all three security migrations in filename order during a maintenance window.
- [ ] Deploy the matching application build immediately after the migrations.
- [ ] Bootstrap the named owner account.
- [ ] Remove the temporary owner setup token and redeploy.
- [ ] Invite the partner through the owner-only invitation flow.
- [ ] Run production database-backed authorization tests for every role and suspension state.
- [ ] Test invalid, expired, replayed, and rate-limited OTP scenarios in production.
- [x] Test valid and invalid Twilio webhook signatures.
- [ ] Verify audit records for every privileged production action.
- [ ] Test database-backup restoration outside production.
- [ ] Establish security monitoring and an incident-response contact process.

## Deployment warning

The security code and database migrations are prepared but have not been applied to the current Supabase project or deployed. The current database is missing the new operator-security columns. Applying only the application or only the migrations would create an incompatible production state; deploy them as one coordinated change after a verified backup.
