# HAULWAY public-launch runbook

This is the release gate for promoting `https://haulway.ca`. Do not advertise the site until every **required** item is complete on the production deployment.

## Required before deployment

- [x] Create a Cloudflare Turnstile production widget restricted to `haulway.ca` and `www.haulway.ca`.
- [x] Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` to Netlify for Production deploys.
- [ ] Confirm `privacy@haulway.ca` and `support@haulway.ca` are real, monitored inboxes.
- [ ] Replace the operator passphrase with a unique random value of at least 20 characters, share it only with the two owners, and store it in a password manager.
- [ ] Remove `OPERATOR_SETUP_TOKEN` from Netlify after the owner row has been created.
- [ ] Confirm Netlify production context contains every variable documented in `.env.example`; no Twilio or Supabase secret may use a `NEXT_PUBLIC_` name.
- [ ] Have Alberta counsel review the Privacy Policy, Terms, SMS Terms, contractor agreement, insurance requirements, and the business identity/mailing address required for customer communications.

## Deploy and smoke test

- [ ] Deploy one immutable commit to Netlify Production.
- [ ] Confirm `https://haulway.ca/api/health` returns HTTP 200 and `{ "status": "ok" }`.
- [ ] Confirm `/privacy`, `/terms`, `/sms-terms`, `/robots.txt`, `/sitemap.xml`, and `/.well-known/security.txt` return HTTP 200.
- [ ] Confirm `https://www.haulway.ca` redirects to `https://haulway.ca` with HTTPS.
- [ ] On a real phone, create a customer account, receive exactly one OTP, create a request, upload media, accept a quote, and receive transactional SMS updates.
- [ ] In the owners-only portal, accept the job, set/change ETA, swipe arrived, chat, complete the job, and confirm the customer tracker updates.
- [ ] Confirm the customer cannot create a second active request.
- [ ] Confirm a wrong OTP, repeated resend, cross-site mutation, unsigned Twilio callback, driver login, driver application, and driver assignment all fail safely.
- [ ] Confirm STOP and HELP behavior on the production Twilio sender.
- [ ] Confirm no secret, raw OTP, full media URL, or customer address appears in Netlify function logs.

## Promotion-day operations

- [ ] Keep one owner signed in to the operator portal and one separate customer test device available.
- [ ] Watch Netlify function errors, Supabase database/auth health, Twilio delivery failures, and the SMS balance during the campaign.
- [ ] Pause promotion if health checks fail, OTP delivery degrades, request state diverges between owner/customer, or payment instructions are unclear.
- [ ] Export a pre-launch Supabase backup and record the deployed Git commit.
- [ ] Prepare a short customer-support response for failed OTPs, delayed arrivals, cancellation, payment questions, and privacy requests.

## Known accepted risk

Administrator access currently uses one shared passphrase at the owners' request. This removes individual accountability and MFA for the most sensitive portal. Keep it owners-only and treat migration to named administrator accounts with MFA as the first post-launch security task.
