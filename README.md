# Haulway

Haulway is a direct Edmonton junk-removal and small-moving service with two interfaces:

- `/` — customer registration, required photo/video requests, quote approval, chat, payment choice, and completion confirmation.
- `/driver` — private operator portal for requests, quotes, chat, cash/Interac tracking, and completion confirmation.

Customer, job, quote, message, and completion data is stored in D1. Uploaded photos and videos are private R2 objects served only to the customer who owns the request or the signed-in operator.

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

The customer accepts or declines the operator's quote, then chooses Interac e-Transfer or cash. Haulway shares the Interac email in the private job chat. No Stripe or online card collection is enabled.
