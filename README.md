# HAULWAY

HAULWAY is an Edmonton junk-removal and small-moving service with two private interfaces:

- `/` — SMS-verified customer access, photo/video requests, quotes, chat, payment choice, ETA, and completion confirmation.
- `/driver` — operator access for accepting requests, setting ETAs, quoting, chat, payment tracking, and completion confirmation.

Customer and request data lives in Supabase Postgres. Uploaded media stays in a private Supabase Storage bucket and is exposed only through short-lived signed URLs after a server-side access check. Request events are written to an SMS outbox, sent immediately through Twilio, and retried by a scheduled Netlify function.

## Supabase setup

1. In the Supabase SQL editor, run every file in `supabase/migrations` in filename order. The storage migration creates the private `job-media` bucket; the security migration adds verified Auth links, durable rate limits, stronger PIN metadata, and the SMS outbox.
2. In **Authentication → Providers → Phone**, enable phone sign-in and configure an SMS provider. Customer sessions are created only after Supabase verifies the six-digit SMS code.
3. Review the Auth rate limits in the Supabase dashboard before production launch.
4. Copy `.env.example` to `.env` and provide the Supabase values. Keep `SUPABASE_SECRET_KEY` server-only.

## Transactional SMS setup

Request receipt, driver acceptance, ETA, quote, operator chat, completion, and payment updates are sent to the customer's verified number.

1. Create a Twilio Messaging Service or choose a Twilio sender number.
2. Create a restricted Twilio API key for production and set `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, and `TWILIO_API_KEY_SECRET`.
3. Set either `TWILIO_MESSAGING_SERVICE_SID` (preferred) or `TWILIO_FROM_NUMBER`.
4. Add the same variables in Netlify. `netlify/functions/sms-dispatch.ts` retries pending messages once per minute.

`TWILIO_AUTH_TOKEN` is supported as a local fallback when API-key credentials are absent. Never expose Twilio or Supabase secrets to browser code. Configure Twilio opt-out handling for the sending region; the first request receipt message includes STOP instructions.

## Security configuration

Set `RATE_LIMIT_SECRET` to a long random value. Set `OPERATOR_SETUP_TOKEN` to a separate value of at least 24 characters before the first `/driver` setup. After the singleton operator account exists, the token can be removed from the deployment environment.

Customer access requires SMS ownership verification. Operator PINs use PBKDF2-SHA-256 with 600,000 iterations, privileged sessions expire after 12 hours, mutations reject cross-site requests, upload types are allowlisted, and internal database errors are not returned to clients.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The first `/driver` visit requires the configured setup token and a new six-digit PIN. There is no demo PIN or seeded data.

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
