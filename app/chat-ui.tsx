"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/contracts";

type Sender = Message["sender"];

/* Messages from the same person within this window read as one thought, so they
   share a sender label and a single timestamp. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

type Group = { key: string; sender: Sender; items: Message[]; at: Date };

function groupMessages(messages: Message[]): Array<{ day: string; groups: Group[] }> {
  const days: Array<{ day: string; groups: Group[] }> = [];
  for (const message of messages) {
    const at = new Date(message.createdAt);
    const day = dayKey(at);
    let bucket = days[days.length - 1];
    if (!bucket || bucket.day !== day) { bucket = { day, groups: [] }; days.push(bucket); }

    const last = bucket.groups[bucket.groups.length - 1];
    const joins = last
      && last.sender === message.sender
      && message.sender !== "system"
      && at.getTime() - last.at.getTime() < GROUP_WINDOW_MS;

    if (joins) { last.items.push(message); last.at = at; }
    else bucket.groups.push({ key: message.id, sender: message.sender, items: [message], at });
  }
  return days;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return "Today";
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric" }).format(date);
}

/* Matches the "2:45 PM" style the API stores for scheduled times — en-CA would
   render "2:45 p.m." here and read inconsistently against the rest of the app. */
function clockTime(date: Date) {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

export function MessageList({ messages, mine, nameFor, pending }: {
  messages: Message[];
  mine: Sender;
  nameFor: (sender: Sender) => string;
  pending?: string[];
}) {
  const days = groupMessages(messages);
  return <>
    {days.map((bucket) => <div className="msg-day" key={bucket.day}>
      <span className="msg-day-label">{dayLabel(new Date(bucket.groups[0].items[0].createdAt))}</span>
      {bucket.groups.map((group) => group.sender === "system"
        ? <p className="msg-system" key={group.key}>{group.items[0].body}</p>
        : <div className={`msg-group ${group.sender === mine ? "mine" : "theirs"}`} key={group.key}>
            <span className="msg-who">{nameFor(group.sender)}</span>
            {group.items.map((item, index) => <p className={`msg ${index === group.items.length - 1 ? "tail" : ""}`} key={item.id}>{item.body}</p>)}
            <span className="msg-time">{clockTime(group.at)}</span>
          </div>)}
    </div>)}

    {/* Optimistic: shown the instant you hit send, greyed until the server confirms. */}
    {pending?.map((body, index) => <div className="msg-group mine pending" key={`pending-${index}`}>
      <span className="msg-who">{nameFor(mine)}</span>
      <p className="msg tail">{body}</p>
      <span className="msg-time">Sending…</span>
    </div>)}
  </>;
}

/* Keeps the thread pinned to the newest message, but only while the reader is
   already at the bottom — scrolling up to re-read shouldn't get yanked away. */
export function useStickyScroll(signal: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 90);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [signal, pinned]);

  function jump() {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  return { ref, pinned, jump };
}

export function Composer({ value, onChange, onSend, busy, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  onSend: (event: FormEvent) => void;
  busy: boolean;
  placeholder: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);

  /* Grow with the text, up to five lines, then scroll inside. */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    /* Enter sends on a physical keyboard; Shift+Enter makes a new line. On touch
       the key never fires, so the send button stays the only way. */
    if (event.key === "Enter" && !event.shiftKey && !isTouch()) {
      event.preventDefault();
      if (value.trim() && !busy) onSend(event as unknown as FormEvent);
    }
  }

  return <form className="chat-composer" onSubmit={onSend}>
    <textarea
      ref={box}
      rows={1}
      aria-label="Message"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
    />
    <button type="submit" disabled={busy || !value.trim()} aria-label="Send message">↑</button>
  </form>;
}

function isTouch() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
