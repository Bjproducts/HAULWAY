# HAULWAY

HAULWAY is a direct Edmonton junk-removal and small-moving service with two interfaces:

- `/` — customer registration, required photo/video requests, quote approval, chat, payment choice, and completion confirmation.
- `/driver` — private operator portal for requests, quotes, chat, cash/Interac tracking, and completion confirmation.

Customers, operator access, sessions, jobs, quotes, messages, and file metadata are stored in Supabase Postgres. Uploaded photos and videos remain in a private Supabase Storage bucket and are served only through short-lived URLs after the app verifies the customer or operator session.

## Supabase setup

1. Open the Supabase SQL editor and run the SQL files in `supabase/migrations` in filename order. The second migration creates the private `job-media` bucket used on Netlify.
2. Copy `.env.example` to `.env`.
3. Add the four values shown in `.env.example`. Never expose the secret key in client-side code.

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `SUPABASE_STORAGE_BUCKET` in both local development and Netlify. The secret key remains server-only; the publishable key is used only with one-time signed upload tokens. Database access stays behind authenticated server routes.

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

## Netlify deployment

Push the repository to your Git provider and import it in Netlify. Netlify detects the standard Next.js app automatically; use `npm run build` if it asks for a build command. Add the four Supabase variables from `.env.example` under **Site configuration → Environment variables**, then deploy.

Uploads go directly from the customer browser to the private Supabase bucket. This keeps photos and videos outside Netlify Function request limits while preserving access checks in the app.

## Current payment flow

The customer accepts or declines the operator's quote, then chooses Interac e-Transfer or cash. HAULWAY shares the Interac email in the private job chat. No Stripe or online card collection is enabled.
