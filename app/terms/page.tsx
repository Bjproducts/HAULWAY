import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Terms of Service | HAULWAY", description: "Terms for booking and using HAULWAY in Edmonton and area.", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return <LegalPage eyebrow="THE GROUND RULES" title="Terms of Service" updated="August 21, 2026">
    <p>These terms govern your use of the HAULWAY website and services. By creating an account, submitting a request, accepting a quote, or using the service, you agree to them.</p>
    <h2>Eligibility and accounts</h2>
    <p>You must be at least 18 years old and able to enter a binding agreement. Keep control of your verified mobile number and tell us promptly if you believe your account has been used without permission. Information you provide must be accurate and complete.</p>
    <h2>Requests and quotes</h2>
    <p>A submitted request is not a guaranteed booking. Photos, descriptions, timing, access, stairs, parking, volume, weight, and travel distance affect availability and price. A job becomes confirmed only when the displayed quote is accepted. Any material difference at pickup may require a revised quote that you can accept or decline before extra work begins.</p>
    <h2>Your responsibilities</h2>
    <p>You must have authority to move or dispose of the items, provide safe and lawful access, identify fragile or unusually heavy items, disclose hazards, secure pets and children, reserve elevators or loading areas where needed, and be available to confirm completion. Do not request transport or disposal of illegal, explosive, radioactive, biohazardous, medical, asbestos-containing, or other regulated dangerous material. We may refuse unsafe or unlawful work.</p>
    <h2>Drivers and service performance</h2>
    <p>Approved drivers may perform services as independent contractors using their own vehicles. Arrival times are estimates and can change because of traffic, weather, access, or earlier jobs. The live tracker is an operational estimate, not a guarantee.</p>
    <h2>Payment, cancellation, and completion</h2>
    <p>Prices are shown in Canadian dollars. Follow only payment instructions displayed inside the signed-in HAULWAY experience or confirmed by authorized support. Never send online-banking credentials. Cancellation may be limited after a quote is accepted or a driver begins travel; reasonable costs already incurred may apply. Review the work before confirming completion and report visible issues promptly through the request chat or support channel.</p>
    <h2>Acceptable use</h2>
    <p>Do not misuse the service, harass a customer or driver, probe or disrupt our systems, upload malicious or unlawful material, impersonate another person, scrape private information, evade rate limits, or use the service for fraud. We may restrict or terminate access to protect users and the service.</p>
    <h2>Disclaimers and liability</h2>
    <p>To the extent permitted by law, the service is provided on an “as available” basis. HAULWAY is not responsible for indirect, incidental, special, or consequential losses. Nothing in these terms excludes rights or remedies that cannot lawfully be excluded, including applicable consumer protections.</p>
    <h2>Changes and governing law</h2>
    <p>We may update these terms by posting a new effective date. Material changes apply prospectively. Alberta law and applicable Canadian federal law govern these terms, and disputes will be handled in Alberta unless mandatory law requires otherwise.</p>
    <h2>Contact</h2>
    <p>Questions about these terms can be sent to <a href="mailto:support@haulway.ca">support@haulway.ca</a>.</p>
  </LegalPage>;
}
