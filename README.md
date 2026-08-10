# HAULWAY

HAULWAY is a direct Edmonton junk-removal and small-moving service with two interfaces:

- `/` — customer registration, required photo/video requests, quote approval, chat, payment choice, and completion confirmation.
- `/driver` — private operator portal for requests, quotes, chat, cash/Interac tracking, and completion confirmation.

Customers, operator access, sessions, jobs, quotes, messages, and file metadata are stored in Supabase Postgres. Uploaded photos and videos remain private R2 objects and are served only to the customer who owns the request or the signed-in operator.

## Supabase setup

1. Open the Supabase SQL editor and run `supabase/migrations/20260810000000_create_haulway_schema.sql`.
2. Copy `.env.example` to `.env`.
3. Add the project URL and server-only secret key. Never expose the secret key in client-side code.

Only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are required by the app. The publishable and JWKS values are not needed because HAULWAY keeps all database access behind authenticated server routes.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The first visit to `/driver` asks you to create a private 6-digit operator PIN. There is no demo PIN and no seeded data.

## Validation

```bash
npm run build
npm run lint
npm test
```

## Current payment flow

The customer accepts or declines the operator's quote, then chooses Interac e-Transfer or cash. HAULWAY shares the Interac email in the private job chat. No Stripe or online card collection is enabled.
