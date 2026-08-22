# Production configuration, migrations, and retention

Last audited: August 22, 2026

## Netlify environment audit

The application source references 25 environment names. Four are supplied by Netlify or Node (`CONTEXT`, `NETLIFY`, `NODE_ENV`, and `URL`). The production project contains every launch-critical custom variable.

- `TURNSTILE_SECRET_KEY`: present in Production and scoped to builds, functions, and runtime.
- `OPERATOR_MFA_ENCRYPTION_KEY`: present in Production and scoped to builds, functions, and runtime.
- `SECURITY_FINGERPRINT_SECRET`: present in Production and scoped to builds, functions, and runtime.
- `TWILIO_STATUS_CALLBACK_URL`: present and set across deploy contexts.
- `TWILIO_FROM_NUMBER`: intentionally blank because `TWILIO_MESSAGING_SERVICE_SID` is configured.
- `OPERATOR_SETUP_TOKEN`: intentionally removed after owner setup; production preflight rejects it if it is restored accidentally.
- `NEXT_PUBLIC_INTERAC_EMAIL`: not configured. Interac is therefore hidden and Cash remains available; the site does not fail when this optional feature is unset.

`npm run verify:deploy` validates the production environment during a Netlify Production build. A validation failure stops the candidate deployment before it replaces the currently published release. It prints variable names and validation reasons, never secret values.

## Migration ledger

The August 22 audit found three skipped objects: the customer-rating columns, the rate-limit-refund function, and the database-level one-active-haul trigger. `20260822000000_reconcile_schema_and_add_ledger.sql` safely creates those missing objects, verifies all launch-critical tables, columns, functions, the one-active-haul trigger, and the private storage bucket, then records all applied migration filenames in `haulway_schema_migrations`.

For every future migration:

1. Add a new timestamped SQL file after the current last migration.
2. Make the schema change and insert that filename into `public.haulway_schema_migrations` in the same transaction.
3. Add the filename to `config/schema-migrations.json`.
4. Run `npm run verify:deploy`, `npm run lint`, and `npm test`.
5. Apply the migration before promoting code that expects it.
6. Confirm `/api/health` reports `configuration`, `database`, and `migrations` as `ok`.

The source manifest prevents an unlisted SQL file from building. Runtime health prevents code/database version drift from appearing as an unexplained healthy deployment.

## Scheduled functions and retention

Netlify currently deploys:

- `sms-dispatch`: every minute; retries durable transactional SMS outbox entries.
- `data-retention`: daily at 04:17 UTC (22:17 MDT during daylight time).

The retention worker always removes expired hashed sessions and rate-limit counters older than 48 hours. Those are security housekeeping records, not customer requests.

Deletion of abandoned, unsubmitted upload drafts and their private media is disabled unless `ABANDONED_DRAFT_RETENTION_HOURS` is explicitly configured between 24 and 8760 hours. Completed bookings, submitted requests, customers, messages, SMS history, and audit events are never deleted by this worker. The owners must approve the draft/media window before enabling it.
