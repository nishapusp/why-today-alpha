"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useUser, SignOutButton } from "@clerk/nextjs";

function ProgressIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 4v16.5h16" stroke="var(--navy)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 15.5l4-3 3.2 2.4L18 8.5" stroke="var(--navy)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 8.5H18v3.5" stroke="var(--navy)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FeedbackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 5.5h16v10.5H9.5L5 19.5V16H4V5.5z"
        stroke="var(--navy)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GlossaryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 6.5V19" stroke="var(--navy)" strokeWidth={1.6} strokeLinecap="round" />
      <path
        d="M12 6.5C10 5.2 6.8 4.7 4 5.2v12.3c2.8-.5 6 0 8 1.3"
        stroke="var(--navy)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 6.5c2-1.3 5.2-1.8 8-1.3v12.3c-2.8-.5-6 0-8 1.3"
        stroke="var(--navy)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isSignedIn } = useUser();

  useEffect(() => {
    setMounted(true);
  }, []);

  const drawer = open && (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="absolute top-0 left-0 bottom-0 w-[78%] max-w-xs bg-white shadow-xl flex flex-col">
        <div
          className="flex items-center justify-between px-4 py-3.5 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="font-display font-semibold text-[16px]" style={{ color: "var(--navy)" }}>
            Menu
          </span>
          <button aria-label="Close menu" onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 5l14 14M19 5L5 19" stroke="var(--text-secondary)" strokeWidth={1.8} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-2 py-2">
          <Link
            href="/glossary"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-[14.5px] font-medium hover:bg-[var(--surface)] transition-colors"
            style={{ color: "var(--text-primary)" }}
          >
            <GlossaryIcon />
            Glossary
          </Link>
          <Link
            href="/progress"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-[14.5px] font-medium hover:bg-[var(--surface)] transition-colors"
            style={{ color: "var(--text-primary)" }}
          >
            <ProgressIcon />
            Progress
          </Link>
          <Link
            href="/feedback"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-[14.5px] font-medium hover:bg-[var(--surface)] transition-colors"
            style={{ color: "var(--text-primary)" }}
          >
            <FeedbackIcon />
            Send feedback
          </Link>
        </nav>

        {isSignedIn && (
          <div className="px-4 py-4 border-t" style={{ borderColor: "var(--border)" }}>
            <SignOutButton>
              <button className="text-[13.5px] font-medium" style={{ color: "var(--text-secondary)" }}>
                Sign out
              </button>
            </SignOutButton>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-9 h-9 -ml-1.5"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" stroke="var(--navy)" strokeWidth={1.8} strokeLinecap="round" />
        </svg>
      </button>

      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}
