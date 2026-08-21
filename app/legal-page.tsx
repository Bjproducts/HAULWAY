import Link from "next/link";

export function LegalPage({ eyebrow, title, updated, children }: {
  eyebrow: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return <main className="legal-shell">
    <header className="legal-bar"><Link href="/" aria-label="Back to Haulway">←</Link><b>HAULWAY</b><span>EDMONTON</span></header>
    <article className="legal-document">
      <span className="micro-label">{eyebrow}</span>
      <h1>{title}</h1>
      <p className="legal-updated">Effective {updated}</p>
      {children}
    </article>
    <footer className="legal-footer"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/sms-terms">SMS Terms</Link><Link href="/">Book a haul</Link></footer>
  </main>;
}
