"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[ui:error]", error.digest ?? error.name); }, [error]);
  return <main className="error-shell">
    <span className="hw-mark">H</span>
    <span className="micro-label">ROUTE INTERRUPTED</span>
    <h1>We hit a bump.</h1>
    <p>Your request data is still safe. Check your connection and try this screen again.</p>
    <button className="hw-primary" onClick={reset}>Try again <span aria-hidden="true">↻</span></button>
    <Link href="/">Return home</Link>
  </main>;
}
