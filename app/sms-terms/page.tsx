import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "SMS Terms | HAULWAY", description: "Terms for HAULWAY verification codes and transactional text updates.", alternates: { canonical: "/sms-terms" } };

export default function SmsTermsPage() {
  return <LegalPage eyebrow="TEXT MESSAGE PROGRAM" title="SMS Terms" updated="August 21, 2026">
    <p>When you provide a mobile number and agree to receive texts, you authorize HAULWAY to send automated or manually initiated messages needed to verify and operate your account or application.</p>
    <h2>Messages you may receive</h2>
    <p>Messages may include one-time verification codes, request confirmations, quote updates, ETA or arrival updates, completion and payment-status notices, and important safety or support information. We will not send promotional marketing texts under this consent; marketing would require a separate choice.</p>
    <h2>Frequency and charges</h2>
    <p>Message frequency varies with your sign-ins, applications, and active requests. Message and data rates may apply according to your wireless plan. Carriers are not liable for delayed or undelivered messages, and delivery is not guaranteed.</p>
    <h2>Stopping messages</h2>
    <p>Reply <strong>STOP</strong> to opt out of supported HAULWAY text messages. Reply <strong>HELP</strong> for help. You can also email <a href="mailto:support@haulway.ca">support@haulway.ca</a>. After opting out, we may send one confirmation message. Because texts are used for authentication and active request updates, opting out may prevent sign-in or use of parts of the service.</p>
    <h2>Your mobile number</h2>
    <p>You confirm that you control the number provided or have the account holder&apos;s permission. Tell us before transferring or cancelling that number so it is not used to contact someone else.</p>
    <h2>Privacy and changes</h2>
    <p>Our <a href="/privacy">Privacy Policy</a> explains how we handle mobile numbers and message records. We may update these SMS Terms by posting a new effective date. Continued participation after an update means you accept the revised terms.</p>
  </LegalPage>;
}
