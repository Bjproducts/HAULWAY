import Link from "next/link";

export default function NotFound() {
  return <main className="not-found-shell">
    <span className="hw-mark">H</span>
    <span className="micro-label">404 · WRONG TURN</span>
    <h1>This route<br />doesn&apos;t go anywhere.</h1>
    <p>The page may have moved, or the address may be incomplete.</p>
    <Link className="hw-primary" href="/">Back to HAULWAY <span aria-hidden="true">→</span></Link>
  </main>;
}
