"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "wt_app_banner_dismissed";

// Set NEXT_PUBLIC_PLAY_STORE_URL once the app is live on the Play Store.
// Until then this component renders nothing — no half-finished banner
// pointing nowhere.
const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL;

function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari's old standalone flag, kept as a fallback.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mq || iosStandalone);
}

export default function AppDownloadBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!PLAY_STORE_URL) return;
    if (isRunningStandalone()) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="sticky top-[54px] z-40 flex items-center justify-between gap-3 px-4 py-2.5 border-b"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-display font-black text-white text-[15px]"
          style={{ background: "var(--navy)" }}
        >
          W
        </div>
        <p className="text-[13px] leading-tight truncate" style={{ color: "var(--text-primary)" }}>
          Get the Why Today app for a faster, distraction-free read.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <a
          href={PLAY_STORE_URL}
          className="text-[12.5px] font-medium px-3 py-1.5 rounded-full text-white whitespace-nowrap"
          style={{ background: "var(--navy)" }}
        >
          Install
        </a>
        <button
          aria-label="Dismiss"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setVisible(false);
          }}
          className="w-7 h-7 flex items-center justify-center shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 5l14 14M19 5L5 19" stroke="var(--text-secondary)" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
