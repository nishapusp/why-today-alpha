"use client";

import { useEffect, useState } from "react";

/**
 * Silent visit tracking + a single lightweight subscribe prompt, per the
 * 2026-07-15 engagement strategy: no upfront ask, no account required —
 * just count distinct-day visits in localStorage (nothing sent anywhere
 * until the reader actually taps "Notify me"), and only once someone has
 * genuinely returned across multiple days does a prompt appear at all.
 *
 * Deliberately push-first, not email/sign-in — zero personal data needed
 * to subscribe, and declining costs the reader nothing (the prompt won't
 * reappear once dismissed).
 */

const VISIT_KEY = "wt_visit_dates";
const DISMISSED_KEY = "wt_push_dismissed";
const SUBSCRIBED_KEY = "wt_push_subscribed";
const DAY_THRESHOLD = 2; // distinct days before the prompt can appear

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function recordVisitAndGetDayCount(): number {
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    const dates: string[] = raw ? JSON.parse(raw) : [];
    const today = todayKey();
    if (!dates.includes(today)) dates.push(today);
    // Keep only the last 14 distinct days — this is a lightweight
    // engagement signal, not a permanent log.
    const trimmed = dates.slice(-14);
    localStorage.setItem(VISIT_KEY, JSON.stringify(trimmed));
    return trimmed.length;
  } catch {
    return 0; // localStorage unavailable (private browsing etc.) — no prompt, fail silent
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export default function PushSubscribePrompt() {
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<"idle" | "subscribing" | "done" | "error">("idle");

  useEffect(() => {
    const dayCount = recordVisitAndGetDayCount();
    if (dayCount < DAY_THRESHOLD) return;
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return; // already said no at the browser level
    if (localStorage.getItem(DISMISSED_KEY) || localStorage.getItem(SUBSCRIBED_KEY)) return;

    setShow(true);
  }, []);

  async function subscribe() {
    setStatus("subscribing");
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Push isn't configured yet");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("idle");
        setShow(false);
        localStorage.setItem(DISMISSED_KEY, "1");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!res.ok) throw new Error("Save failed");

      localStorage.setItem(SUBSCRIBED_KEY, "1");
      setStatus("done");
      setTimeout(() => setShow(false), 2000);
    } catch {
      setStatus("error");
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-40 max-w-sm mx-auto rounded-2xl shadow-lg px-4 py-3.5 flex items-center gap-3"
      style={{ background: "var(--navy)", border: "1px solid var(--gold)" }}
    >
      <span className="text-2xl shrink-0">🔔</span>
      <div className="flex-1 min-w-0">
        {status === "done" ? (
          <p className="text-[13.5px] font-medium text-white">You&apos;re subscribed — we&apos;ll let you know when a big story lands.</p>
        ) : (
          <>
            <p className="text-[13.5px] font-medium text-white leading-snug">
              Get notified when major banking &amp; finance stories go live?
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={subscribe}
                disabled={status === "subscribing"}
                className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full"
                style={{ background: "var(--gold)", color: "var(--navy-deep)" }}
              >
                {status === "subscribing" ? "..." : "Notify me"}
              </button>
              <button onClick={dismiss} className="text-[12.5px] font-medium text-white/60">
                Not now
              </button>
            </div>
            {status === "error" && (
              <p className="text-[11px] text-white/50 mt-1">Something went wrong — try again later.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
