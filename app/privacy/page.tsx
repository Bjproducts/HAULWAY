import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Privacy Policy | HAULWAY", description: "How HAULWAY collects, uses, protects, and shares personal information.", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  const contact = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || "privacy@haulway.ca";
  return <LegalPage eyebrow="YOUR INFORMATION" title="Privacy Policy" updated="August 21, 2026">
    <p>HAULWAY provides junk-removal and small-moving coordination in Edmonton and surrounding communities. This policy explains how we handle personal information under Alberta&apos;s private-sector privacy requirements.</p>
    <h2>Information we collect</h2>
    <p>We collect information you provide, including your name, mobile number, pickup and drop-off details, unit or building information, photos or videos of items, request notes, messages, quotes, completion confirmations, and ratings. We record payment status, but we do not ask you to send online-banking passwords or security answers.</p>
    <p>Our systems also generate security and operational records, including session data, delivery status, timestamps, audit events, and hashed network or device indicators. We do not use precise background location tracking.</p>
    <h2>Why we use it</h2>
    <ul><li>Verify accounts and prevent fraud or abuse.</li><li>Create, quote, perform, support, and complete requests.</li><li>Send security codes and transactional request updates.</li><li>Meet legal, safety, accounting, dispute, and security obligations.</li><li>Improve reliability and the customer experience.</li></ul>
    <h2>When information is shared</h2>
    <p>We share only what is reasonably needed with authorized HAULWAY owners and service providers that host or protect the service, store data and media, or deliver text messages. Current providers include Netlify, Supabase, and Twilio. Providers may process information outside Canada, where it can be subject to the laws of that jurisdiction.</p>
    <p>We may also disclose information when required by law, to protect people or property, investigate abuse, or complete a business transaction subject to appropriate safeguards. We do not sell personal information.</p>
    <h2>Retention and protection</h2>
    <p>We keep personal information only as long as reasonably necessary for the purposes above and applicable legal or operational requirements, then securely delete or de-identify it. We use access controls, encryption in transit, restricted storage, rate limits, audit records, and other safeguards appropriate to the sensitivity of the information. No internet service can promise absolute security.</p>
    <h2>Your choices and rights</h2>
    <p>You may ask to access or correct your personal information, withdraw consent where the law permits, or ask about retention and deletion. Withdrawing consent for essential account or service texts may prevent us from providing the service. Reply STOP to supported HAULWAY messages to stop future texts and HELP for help.</p>
    <h2>Contact</h2>
    <p>Send privacy questions or requests to <a href={`mailto:${contact}`}>{contact}</a>. We may need to verify your identity before acting on an access, correction, or deletion request.</p>
  </LegalPage>;
}
