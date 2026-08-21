# HAULWAY

HAULWAY is an Edmonton junk-removal and small-moving service with two private interfaces:

- `/` — SMS-verified customer access, photo/video requests, quotes, chat, payment choice, ETA, and completion confirmation.
- `/driver` — owners-only operations portal for accepting every order, ETAs, quotes, chat, payment tracking, arrival, and completion confirmation.

Public driver applications, driver SMS sign-in, driver assignment, and driver-management endpoints are disabled for the owner-operated launch. The legacy database tables remain dormant so a future fleet model can be designed and migrated deliberately without destructive production changes.

The one-active-haul guard remains enforced in both the API and database. If an unfinished request must be closed, an owner can cancel it from the operations portal; the audit record is retained and the customer is automatically released to book again.

Customer and request data lives in Supabase Postgres. Uploaded media stays in a private Supabase Storage bucket and is exposed only through short-lived signed URLs after a server-side access check. Request events are written to an SMS outbox, sent immediately through Twilio, and retried by a scheduled Netlify function.

## Supabase setup

1. In the Supabase SQL editor, run every file in `supabase/migrations` in filename order. The migrations create the private `job-media` bucket, verified Auth links, durable rate limits, the SMS outbox, operator accounts, upload quarantine metadata, and immutable audit records. Legacy driver schema is retained but is not reachable by the launch application.
2. In **Authentication → Providers → Phone**, enable phone sign-in and configure an SMS provider. Customer sessions are created only after Supabase verifies the six-digit SMS code.
3. Review the Auth rate limits in the Supabase dashboard before production launch.
4. Copy `.env.example` to `.env` and provide the Supabase values. Keep `SUPABASE_SECRET_KEY` server-only.

## Transactional SMS setup

Request receipt, Haulway acceptance, ETA, quote, owner chat, completion, and payment updates are sent to the customer's verified number.

1. Create a Twilio Messaging Service or choose a Twilio sender number.
2. Create a restricted Twilio API key for sending and set `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, and `TWILIO_API_KEY_SECRET`. Also set the account Auth Token server-side so callback signatures can be verified.
3. Set either `TWILIO_MESSAGING_SERVICE_SID` (preferred) or `TWILIO_FROM_NUMBER`.
4. Set `TWILIO_STATUS_CALLBACK_URL` to the canonical HTTPS `/api/webhooks/twilio/status` route and configure the same URL in Twilio. The signed callback records delivered, failed, and undelivered outcomes.
5. Add the same variables in Netlify. `netlify/functions/sms-dispatch.ts` retries pending messages once per minute.

`TWILIO_AUTH_TOKEN` is supported as a local fallback when API-key credentials are absent. Never expose Twilio or Supabase secrets to browser code. Configure Twilio opt-out handling for the sending region; the first request receipt message includes STOP instructions.

## Security configuration

Set `APP_ORIGIN` to the canonical HTTPS site, and use independent random values for `RATE_LIMIT_SECRET`, `SECURITY_FINGERPRINT_SECRET`, `OPERATOR_SETUP_TOKEN`, and the 32-byte `OPERATOR_MFA_ENCRYPTION_KEY`. Remove the setup token after the first named admin account is enrolled.

Customer access always requires SMS ownership verification; there is no unverified fallback route. Operators use named accounts, PBKDF2-SHA-256 passphrases, encrypted TOTP authenticator secrets, one-time-code replay protection, eight-hour absolute sessions, and a 30-minute idle lock. Mutations reject cross-site and oversized bodies, job changes use optimistic concurrency, stored upload bytes are signature checked before publication, and sensitive actions write audit events.

The production access model, Twilio checklist, coordinated deployment steps, and acceptance tests are documented in [`docs/SECURITY_DEPLOYMENT_AND_ACCESS.md`](docs/SECURITY_DEPLOYMENT_AND_ACCESS.md).

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The first `/driver` visit requires the configured setup token, a named operator email, a strong passphrase, and an authenticator app. There is no demo credential or seeded data.

## Validation

```bash
npm run build
npm run lint
npm test
```

## Netlify deployment

Import the repository in Netlify and add every required value from `.env.example` under **Site configuration → Environment variables**. Netlify uses `npm run build` and its Next.js adapter. Direct signed uploads keep photos and videos outside Function request limits while preserving private access checks.

## Payment flow

The customer accepts or declines the operator's quote. After both parties confirm completion, the customer chooses Interac e-Transfer or cash and the operator records receipt. No card data is collected or stored.
