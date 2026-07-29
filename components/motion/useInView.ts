"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared entrance-animation trigger for components/motion/* — fires once
 * when the element scrolls into view, then disconnects. Every motion
 * component's "animation" prop (fade/slide/zoom/count-up/...) reacts to the
 * `inView` flag this returns rather than each component wiring its own
 * IntersectionObserver.
 */
export function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  // Always starts false, matching every environment's server-rendered HTML
  // (the effect below never runs during SSR) — initializing this any other
  // way based on `typeof IntersectionObserver` causes a hydration mismatch,
  // since that check is "undefined" in Node but not in the browser.
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // No IntersectionObserver support (very old browsers) — reveal on
      // the next frame rather than synchronously in the effect body.
      const id = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(id);
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, inView };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
