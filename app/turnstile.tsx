"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

export function Turnstile({ action, onToken, resetKey = 0 }: {
  action: string;
  onToken: (token: string) => void;
  resetKey?: number;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const tokenHandler = useRef(onToken);
  useEffect(() => { tokenHandler.current = onToken; }, [onToken]);

  const renderWidget = useCallback(() => {
    if (!siteKey || !container.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      action,
      appearance: "interaction-only",
      theme: "light",
      size: "flexible",
      callback: (token: string) => tokenHandler.current(token),
      "expired-callback": () => tokenHandler.current(""),
      "error-callback": () => tokenHandler.current(""),
    });
  }, [action, siteKey]);

  useEffect(() => {
    if (!widgetId.current || !window.turnstile) return;
    window.turnstile.reset(widgetId.current);
    tokenHandler.current("");
  }, [resetKey]);

  useEffect(() => () => {
    if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
    widgetId.current = null;
  }, []);

  if (!siteKey) {
    return <p className="bot-check-note">Automated abuse protection activates in production.</p>;
  }

  return <div className="bot-check">
    <Script
      id="cloudflare-turnstile"
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive"
      onReady={renderWidget}
      onError={() => tokenHandler.current("")}
    />
    <div ref={container} aria-label="Security check" />
  </div>;
}
