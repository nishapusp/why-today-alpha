"use client";

import { useEffect, useRef, useState } from "react";

interface AudioReaderProps {
  text: string;
  label?: string;
  accent?: string;
}

/**
 * Reads text aloud using the browser's built-in text-to-speech
 * (Web Speech API) — no API keys, no cost, works today. Quality varies by
 * device/browser; if that's not good enough later, this is a clean place
 * to swap in a premium TTS API behind the same play/pause interface.
 */
export default function AudioReader({ text, label = "Listen", accent = "var(--navy)" }: AudioReaderProps) {
  const [status, setStatus] = useState<"idle" | "playing" | "paused" | "unsupported">("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setStatus("unsupported");
    }
    // Stop any speech if the component unmounts (e.g. navigating away mid-read)
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function pickVoice(): SpeechSynthesisVoice | undefined {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang === "en-IN") ||
      voices.find((v) => v.lang?.startsWith("en")) ||
      voices[0]
    );
  }

  function speak() {
    if (status === "unsupported") return;

    if (status === "paused") {
      window.speechSynthesis.resume();
      setStatus("playing");
      return;
    }

    window.speechSynthesis.cancel(); // stop anything else currently playing
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 0.98;
    utterance.onend = () => setStatus("idle");
    utterance.onerror = () => setStatus("idle");
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setStatus("playing");
  }

  function pause() {
    window.speechSynthesis.pause();
    setStatus("paused");
  }

  function stop() {
    window.speechSynthesis.cancel();
    setStatus("idle");
  }

  if (status === "unsupported") return null; // fail silently, don't clutter the UI

  return (
    <div className="inline-flex items-center gap-2">
      {status === "playing" ? (
        <button
          onClick={pause}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{ background: accent, color: "#fff" }}
        >
          ⏸ Pause
        </button>
      ) : (
        <button
          onClick={speak}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border"
          style={{ borderColor: accent, color: accent }}
        >
          🔊 {status === "paused" ? "Resume" : label}
        </button>
      )}
      {status !== "idle" && (
        <button
          onClick={stop}
          className="text-xs text-[var(--text-secondary)] underline"
        >
          Stop
        </button>
      )}
    </div>
  );
}
