"use client";

import { useState } from "react";

interface StoryFeedbackProps {
  slug: string;
  headline: string;
  accent: string;
  tint: string;
  deep: string;
}

export default function StoryFeedback({ slug, headline, accent, tint, deep }: StoryFeedbackProps) {
  const [reacted, setReacted] = useState<"up" | "down" | null>(null);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  async function sendFeedback(reaction: "up" | "down", commentText?: string) {
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reaction, comment: commentText }),
      });
    } catch {
      // Non-fatal — feedback is a nice-to-have, not core functionality.
    }
  }

  function handleUp() {
    setReacted("up");
    setSubmitted(true);
    sendFeedback("up");
  }

  function handleDownClick() {
    setReacted("down");
    setShowCommentBox(true);
  }

  function submitDown() {
    setSubmitted(true);
    setShowCommentBox(false);
    sendFeedback("down", comment);
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: headline, url });
      } catch {
        // User cancelled the share sheet — not an error.
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    }
  }

  return (
    <div className="rounded-2xl p-5 my-6" style={{ background: tint }}>
      {!submitted ? (
        <>
          <p className="text-sm font-medium mb-3" style={{ color: deep }}>
            Did this story help?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleUp}
              className="text-sm font-semibold px-4 py-2 rounded-full text-white"
              style={{ background: accent }}
            >
              👍 It improved my understanding
            </button>
            <button
              onClick={handleDownClick}
              className="text-sm font-semibold px-4 py-2 rounded-full border"
              style={{ borderColor: accent, color: deep }}
            >
              👎 Needs better style or content
            </button>
          </div>

          {showCommentBox && (
            <div className="mt-3">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional — what specifically felt off? (too dry, too short, missing numbers, etc.)"
                className="w-full text-sm rounded-lg p-3 border"
                style={{ borderColor: "rgba(0,0,0,0.15)" }}
                rows={2}
              />
              <button
                onClick={submitDown}
                className="mt-2 text-sm font-semibold px-4 py-2 rounded-full text-white"
                style={{ background: accent }}
              >
                Send feedback
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm font-medium" style={{ color: deep }}>
          {reacted === "up" ? "Thanks — glad it landed." : "Thanks — this'll help improve the next version."}
        </p>
      )}

      <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: accent }}
        >
          🔗 {shareState === "copied" ? "Link copied!" : "Share this story"}
        </button>
      </div>
    </div>
  );
}
