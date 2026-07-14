"use client";

import { useEffect, useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";

const SESSION_KEY = "wt_stories_viewed";
const DISMISS_KEY = "wt_signin_prompt_dismissed";
const TRIGGER_COUNT = 2;

/**
 * Fires once, after a reader opens their 2nd distinct story in a session —
 * not on the 1st (too early, feels pushy) and not repeatedly (only once
 * per session, and never again this session once dismissed). Signed-in
 * readers never see it.
 */
export default function SignInPrompt({ slug }: { slug: string }) {
  const { isSignedIn, isLoaded } = useUser();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isLoaded || isSignedIn) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    let viewed: string[] = [];
    try {
      viewed = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]");
    } catch {
      viewed = [];
    }

    if (!viewed.includes(slug)) {
      viewed.push(slug);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(viewed));
    }

    if (viewed.length >= TRIGGER_COUNT) {
      setShow(true);
    }
  }, [isLoaded, isSignedIn, slug]);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0"
      role="dialog"
      aria-modal="true"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-lg mb-1.5" style={{ color: "var(--text-primary)" }}>
          Enjoying today&apos;s stories?
        </p>
        <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
          Sign in to track your reading streak, save your learning score, and pick up where you left off.
        </p>
        <div className="flex items-center gap-2.5">
          <SignInButton mode="modal">
            <button
              className="flex-1 text-[14px] font-medium px-4 py-2.5 rounded-full text-white"
              style={{ background: "var(--navy)" }}
              onClick={dismiss}
            >
              Sign in
            </button>
          </SignInButton>
          <button
            className="text-[14px] font-medium px-4 py-2.5 rounded-full"
            style={{ color: "var(--text-secondary)" }}
            onClick={dismiss}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
