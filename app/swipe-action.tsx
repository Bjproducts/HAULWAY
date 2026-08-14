"use client";

import { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, useRef, useState } from "react";

export function SwipeAction({ busy, confirmed, label, confirmedLabel, onConfirm, tone = "default" }: {
  busy: boolean;
  confirmed: boolean;
  label: string;
  confirmedLabel: string;
  onConfirm: () => Promise<boolean>;
  tone?: "default" | "arrival";
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const current = useRef(0);

  function begin(event: ReactPointerEvent<HTMLButtonElement>) {
    if (busy || confirmed) return;
    start.current = event.clientX;
    current.current = 0;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    if (start.current == null || busy || confirmed) return;
    const maximum = Math.max(0, event.currentTarget.getBoundingClientRect().width - 64);
    const next = Math.min(maximum, Math.max(0, event.clientX - start.current));
    current.current = next;
    setOffset(next);
  }

  function finish(event: ReactPointerEvent<HTMLButtonElement>) {
    if (start.current == null) return;
    const maximum = Math.max(0, event.currentTarget.getBoundingClientRect().width - 64);
    const completed = maximum > 0 && current.current / maximum >= .72;
    start.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (completed) {
      setOffset(maximum);
      void onConfirm().then((succeeded) => {
        if (!succeeded) {
          current.current = 0;
          setOffset(0);
        }
      });
    } else {
      current.current = 0;
      setOffset(0);
    }
  }

  function keyConfirm(event: KeyboardEvent<HTMLButtonElement>) {
    if (!busy && !confirmed && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      void onConfirm();
    }
  }

  return <button
    type="button"
    className={`swipe-confirm ${tone === "arrival" ? "arrival" : ""} ${confirmed ? "confirmed" : ""} ${dragging ? "dragging" : ""}`}
    style={{ "--swipe-x": `${offset}px` } as CSSProperties}
    disabled={busy || confirmed}
    aria-label={confirmed ? confirmedLabel : label}
    onPointerDown={begin}
    onPointerMove={move}
    onPointerUp={finish}
    onPointerCancel={finish}
    onKeyDown={keyConfirm}
  >
    <span className="swipe-fill" aria-hidden="true" />
    <span className="swipe-thumb" aria-hidden="true">{confirmed ? "✓" : "→"}</span>
    <span className="swipe-label">{busy ? "Updating…" : confirmed ? confirmedLabel : label}</span>
  </button>;
}
