# HAULWAY security, access, and deployment guide

Last updated: August 19, 2026

## Agreed operating model

HAULWAY has three distinct account types:

1. **Customers** verify ownership of their phone number with a Supabase SMS one-time code. They can access only their own requests, messages, and media.
2. **Administrators** manage the business, approve drivers, dispatch work, and access all jobs. For the initial launch, the two owners have chosen one owners-only shared passphrase. This is an accepted temporary risk: it has no individual accountability or administrator MFA. Named accounts with separate passphrases and authenticator enrollment remain the required post-launch target.
3. **Drivers** apply for access, remain unable to see jobs while pending, and receive a driver account only after an administrator approves the application. Approved drivers can access only jobs assigned to them.

The first administrator is the **owner account**. A database invariant permits only one owner. The partner is a separate administrator and does not share the owner's credentials.

The current driver operating assumption is **independent contractor using their own vehicle**. The database records engagement type and vehicle source separately so HAULWAY can move to employees, company vehicles, or a mixed fleet later without redesigning account ownership or job assignment.

## Driver onboarding flow

The recommended flow avoids accepting a reusable password from someone who has not yet been approved:

1. The applicant submits a driver application with their name, verified contact information, and the minimum business information required for review.
2. The application enters the `pending` state. It does not create an authenticated operator session and does not expose the job queue.
3. An administrator reviews the application and either approves or rejects it. The action is recorded in the immutable audit log.
4. Approval binds the driver record to the phone identity already verified through Supabase Auth and sends the decision to that verified number by SMS. Email is not accepted as proof of driver identity.
5. The approved driver signs in by requesting a fresh, short-lived SMS one-time code. There is no reusable driver password; access remains revocable and every session is bound to the approved driver account.
6. The driver account remains active only while its approval and recorded compliance are current.
7. An administrator assigns jobs to the driver. The driver can access only those assigned jobs.
8. Administrators can suspend a driver immediately, which invalidates the driver's existing sessions.

Driver applications must be protected by per-IP and per-contact rate limits, generic responses that do not disclose whether an account exists, strict body-size limits, and bot protection before the public form is launched.

## Alberta and Edmonton driver-screening requirements

Research checked against official Alberta, City of Edmonton, WCB-Alberta, and Canada Revenue Agency guidance on August 19, 2026. This is an implementation checklist, not legal advice. Confirm the final operating model with the City, the insurer, WCB-Alberta, and an Alberta employment lawyer before onboarding drivers.

### Information to collect in the initial application

Collect only the information needed to decide whether to continue screening:

- Legal full name.
- Mobile phone number, verified by SMS before the application can be submitted.
- Email address for administrative notices; email does not replace phone verification.
- Edmonton-area service availability and general service area. Do not collect a full home address at this stage.
- Vehicle source. The launch application fixes this to the agreed **own vehicle** model, while the data model can later support a HAULWAY vehicle.
- Vehicle type and axle count.
- Alberta driver's licence class and expiry date. Do not collect a licence image or licence number in the public first step.
- Confirmation that the applicant can legally work in Canada. Do not collect a Social Insurance Number in this application.
- Consent to the privacy notice and to later verification of driving and business records if the owners advance the application.

The licence class must match the assigned vehicle. Alberta states that Class 5 covers a two-axle single motor vehicle, while Class 3 is required for a single motor vehicle with three or more axles. Air-brake equipment requires the appropriate qualification. See [Alberta's driver-licence classes](https://www.alberta.ca/motor-vehicle-information-products-explained).

### Information to request only after owner review

For a candidate the owners intend to approve, request and verify:

- Government photo identification and the original driver's licence during a controlled identity check.
- A recent three-year Standard Driver's Abstract for a non-commercial driving history, or a Commercial Driver's Abstract where the driver has commercial history or will operate an NSC-regulated vehicle. An employer or prospective employer needs valid written consent to request the abstract. See [Alberta driver's abstracts](https://www.alberta.ca/get-drivers-abstract).
- Proof that the vehicle is validly registered and insured for the actual commercial use. Alberta requires vehicles on public roads to have valid insurance and registration, and treats a vehicle transporting goods as commercial. See [Alberta vehicle registration](https://www.alberta.ca/register-vehicle).
- Insurer confirmation of commercial-use automobile liability and cargo/property coverage appropriate to the vehicle, goods, and business model. Do not accept a personal-use policy without written insurer confirmation.
- Registration and inspection details for a trailer, when one will be used.
- Expiry dates for every verified document so the system can suspend assignment before a document expires.

Do not retain full document images indefinitely. Store them privately, restrict them to owner review, record the verification outcome and expiry date, and delete the image according to a written retention schedule.

### Conditional commercial-carrier requirements

- A Safety Fitness Certificate is required for a truck/trailer combination registered at **11,794 kg or more** and operating solely in Alberta. The threshold is **more than 4,500 kg** when transporting goods outside Alberta. See [Alberta commercial-carrier pre-entry requirements](https://www.alberta.ca/pre-entry-requirements-commercial-carriers).
- Annual commercial vehicle inspections apply above the same 11,794 kg intra-provincial threshold and above 4,500 kg when operating extra-provincially. See [Alberta's commercial Vehicle Inspection Program](https://www.alberta.ca/vehicle-inspection-program-commercial-vehicles).
- The application must capture registered gross vehicle weight and whether the driver will leave Alberta before HAULWAY assigns work that could cross either threshold.
- HAULWAY should initially prohibit hazardous waste and dangerous goods. Alberta requires manifests or other shipping documents for hazardous waste, and the Edmonton Waste Management Centre prohibits or specially handles many commercial materials. See [Alberta hazardous-waste transportation](https://www.alberta.ca/hazardous-waste-transportation) and [Edmonton commercial disposal rules](https://www.edmonton.ca/programs_services/garbage_waste/disposal-rates).

### Edmonton and business-level requirements

- Edmonton requires every person or company conducting business in the city to hold a business licence. Moving falls under **Delivery and Logistic Service**, while the City's category index lists junk-removal services separately; the City may assign multiple categories. HAULWAY should confirm both activities with Edmonton Business Licensing before launch. See [Edmonton business licensing](https://www.edmonton.ca/business_economy/business-licensing) and [business licence categories](https://www.edmonton.ca/business_economy/licences_permits/business-licence-classifications).
- Junk-removal loads are treated as non-residential commercial waste at the Edmonton Waste Management Centre and are subject to commercial fees and material restrictions. Drivers must never present business waste as residential waste.
- A police information check is not listed by the City as a general requirement for moving or junk-removal categories. HAULWAY should not collect one by default without a documented, legally reviewed screening purpose.

### Employee-versus-contractor decision

HAULWAY's current plan is to engage drivers as independent contractors using their own vehicles. The product records that assumption explicitly, but legal classification depends on the real working relationship and must be revisited if operating practices or vehicle ownership change:

- If drivers are **employees**, HAULWAY is responsible for the applicable employment, payroll, WCB, training, vehicle, and supervision obligations.
- For the current **independent-contractor** model, request the contractor's legal business name, Edmonton business-licence status where applicable, commercial insurance, and a WCB-Alberta clearance letter during controlled post-application review. WCB warns that a hiring company may become responsible for coverage and premiums when a contractor lacks appropriate coverage. See [WCB-Alberta contractor coverage](https://www.wcb.ab.ca/insurance-and-premiums/types-of-coverage/coverage-for-contractors-and-subcontractors.html).
- Calling someone a contractor is not enough. The actual control, payment, equipment, opportunity for profit or loss, and working relationship determine status. CRA provides guidance and a CPP/EI ruling process. See [CRA employment status guidance](https://www.canada.ca/en/revenue-agency/services/tax/canada-pension-plan-cpp-employment-insurance-ei-rulings/employee-self-employed.html).

### Privacy requirements

Alberta's PIPA requires private businesses to collect personal information only for reasonable purposes, limit collection to what is reasonably needed, normally obtain consent, explain the purpose, and identify a contact who can answer privacy questions. It also requires reasonable safeguards and retention only as long as needed. See [Alberta PIPA collection guidance](https://www.alberta.ca/collecting-personal-information) and [protection responsibilities](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information).

The public application must therefore include a clear collection notice, express consent, a privacy-contact title, document retention periods, access controls, and a process for applicants to request access or correction.

## Administrator rules

- Never share administrator credentials or authenticator secrets.
- Launch exception: the owner and partner temporarily use one unique owners-only passphrase stored in a password manager. Move to separate named accounts and MFA after launch.
- Only the owner may create, promote, demote, suspend, or remove administrator accounts. The partner administrator may manage operations and drivers but may not change administrator access.
- All driver approvals, rejections, suspensions, job assignments, payment acknowledgements, and administrator changes must be audited.
- Operator sessions have an eight-hour absolute lifetime and a 30-minute idle timeout.
- Removing or suspending an operator must invalidate all of that operator's sessions.

## Current implementation status

Implemented in the prepared code:

- Mandatory customer SMS verification with no insecure fallback.
- One named owner bootstrap account with a strong passphrase and encrypted TOTP MFA.
- Separate `admin` and `driver` roles.
- Driver job access limited to `assigned_operator_id`.
- One-time authenticator-code replay protection.
- Privileged session rotation, device binding, absolute expiry, and idle expiry.
- Origin validation, request-size enforcement, rate limiting, and safe public errors.
- Optimistic concurrency checks on job actions.
- Immutable audit events.
- Stored-file signature verification before media becomes accessible.
- Signed Twilio delivery-status callbacks and a durable SMS outbox.
- Safe cleanup of abandoned uploads and expired sessions.
- Public independent-contractor applications with privacy consent and verified SMS ownership.
- Administrator application review with licence, abstract, commercial insurance, registration, WCB, and Edmonton business-licence attestations.
- Approved-driver SMS sign-in, compliance expiry enforcement, suspension, reactivation, and compliance refresh.
- Administrator-only assignment of compliant drivers; drivers continue to see only assigned jobs.
- Owner-only, 24-hour, single-use administrator invitations with separate passphrase and authenticator enrollment.
- Owner-only administrator suspension and reactivation with immediate session invalidation.

Required before inviting the partner or accepting driver applications:

- Account recovery that requires verified contact ownership and does not bypass MFA.
- Production database-backed authorization tests for owner, admin, pending driver, active driver, suspended driver, and customer roles.
- Production bot/challenge protection in front of SMS requests in addition to the built-in honeypot and database rate limits.

Until those items are implemented, only the initial named owner account should be created.

## Twilio configuration plan

HAULWAY will use Twilio for transactional request updates. Top up the Twilio account before enabling production booking.

1. Create or select a Twilio Messaging Service and production sender.
2. Create a restricted API key for sending SMS.
3. Store `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, and `TWILIO_API_KEY_SECRET` only in Netlify environment variables.
4. Store the account `TWILIO_AUTH_TOKEN` only in Netlify so HAULWAY can verify webhook signatures.
5. Set `TWILIO_MESSAGING_SERVICE_SID` or, if necessary, `TWILIO_FROM_NUMBER`.
6. Set `TWILIO_STATUS_CALLBACK_URL` to `https://haulway.ca/api/webhooks/twilio/status` in both Netlify and Twilio.
7. Configure Supabase Phone Auth with the production SMS provider and review its OTP rate limits.
8. Confirm opt-out handling, including STOP, and test delivered, failed, and undelivered callbacks.

Do not place any Twilio secret in a variable beginning with `NEXT_PUBLIC_`, in source control, or in browser code.

## Netlify environment checklist

Configure these values before deployment:

- `APP_ORIGIN=https://haulway.ca,https://www.haulway.ca`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_STORAGE_BUCKET=job-media`
- `RATE_LIMIT_SECRET` — an independent random value of at least 32 characters
- `SECURITY_FINGERPRINT_SECRET` — a different random value of at least 32 characters
- `OPERATOR_SETUP_TOKEN` — a temporary independent random value of at least 32 characters
- `OPERATOR_MFA_ENCRYPTION_KEY` — exactly 32 random bytes encoded as base64url or 64 hexadecimal characters
- `NEXT_PUBLIC_INTERAC_EMAIL` — the business-controlled payment address
- `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` — the monitored address named in the Alberta PIPA collection notice
- All Twilio variables listed in the preceding section

The MFA encryption key must be backed up securely. Losing it prevents existing operator authenticator secrets from being decrypted. Changing it without a controlled MFA re-enrollment process locks operators out.

## Coordinated deployment runbook

The security migration removes the old shared-PIN verifier columns and invalidates legacy operator sessions. Treat deployment as a coordinated change.

1. Enable Supabase backups or take a verified database backup.
2. Confirm the custom domain and TLS are active.
3. Add all required Netlify environment variables, but do not expose their values in screenshots or chat.
4. Top up and configure Twilio, then verify the callback URL and sender.
5. Put the site into a short maintenance window.
6. Apply every Supabase migration in filename order, including `20260819000000_launch_security_hardening.sql`, `20260819100000_driver_onboarding.sql`, and `20260819110000_admin_invitations.sql`.
7. Deploy the prepared Netlify build immediately after the migration.
8. Open `/driver` and create the owner's named account with the temporary setup token and an authenticator app.
9. Remove `OPERATOR_SETUP_TOKEN` from Netlify and trigger a clean redeploy.
10. From **Drivers → Admins**, create the partner's 24-hour invitation and send the generated link privately. The partner must create their own passphrase and authenticator enrollment.
11. Run the end-to-end checks below before reopening booking.

Do not run the new migration while an older production deployment is expected to continue serving operator traffic.

## Production acceptance checks

- A customer cannot sign in without a valid SMS code.
- The removed direct-auth endpoint returns HTTP 410 and creates no session.
- Cross-site mutation requests are rejected.
- The owner can sign in only with the correct email, passphrase, and current authenticator code.
- Reusing the same authenticator code is rejected.
- An idle operator session expires after 30 minutes.
- An unassigned driver cannot list or retrieve another driver's job.
- An uploaded file whose bytes do not match its declared type is rejected and removed.
- Driver acceptance, ETA, arrival, quote, chat, completion, and payment updates create SMS outbox records.
- Twilio delivered and failed callbacks update the outbox only when the signature is valid.
- Audit events exist for privileged actions and cannot be edited or deleted.
- Only one active customer booking is allowed at a time.
- Database backup restoration has been tested outside production.

## Incident response basics

If an administrator device or credential is compromised:

1. Suspend the affected account and invalidate its sessions.
2. Rotate the account passphrase and TOTP enrollment.
3. Review audit events, job changes, messages, assignments, and payment acknowledgements.
4. Rotate affected provider keys if server credentials may have been exposed.
5. Preserve logs and document the timeline before deleting evidence.

Never clear production audit records during testing. Use an isolated staging project for destructive end-to-end tests.
