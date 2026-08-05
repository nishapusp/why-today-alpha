"use client";

import { useState } from "react";
import type { Story, QuickRead } from "@/lib/types";

// Text fields safe to edit directly via PATCH — anything structural
// (timeMachine, chart, keyNumbers, knowledgeChain, officialSources) is
// blocked server-side too (see app/api/admin/story/route.ts), but
// listing them here keeps the edit form itself from even offering
// fields that would just get rejected.
const EDITABLE_STORY_FIELDS: { key: keyof Story; label: string; multiline?: boolean }[] = [
  { key: "headline", label: "Headline" },
  { key: "whatsappHeadline", label: "WhatsApp headline" },
  { key: "notificationHeadline", label: "Notification headline" },
  { key: "summary", label: "Summary", multiline: true },
  { key: "quickRead", label: "Quick read", multiline: true },
  { key: "whatHappened", label: "What happened", multiline: true },
  { key: "whyToday", label: "Why today", multiline: true },
  { key: "whyCare", label: "Why care", multiline: true },
  { key: "whatNext", label: "What next", multiline: true },
  { key: "deepDiveRead", label: "Deep dive", multiline: true },
];

function StoryRow({ story, onChanged }: { story: Story; onChanged: () => void }) {
  const [mode, setMode] = useState<"view" | "edit" | "regenerate">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");

  async function handleDelete() {
    if (!confirm(`Delete "${story.headline}"? This removes it from the live edition immediately.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/story", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: story.slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/story", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: story.slug, fields: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMode("view");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    if (!feedback.trim()) {
      setError("Add feedback describing what should change.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugOrMode: story.slug, feedbackOrTopic: feedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Regeneration trigger failed");
      setMessage(data.message);
      setMode("view");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regeneration trigger failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded-xl p-3 mb-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-mono opacity-60">{story.category} &middot; {story.slug}</p>
          <p className="font-medium text-[15px]">{story.headline}</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {message && <p className="text-sm text-green-700 mt-2">{message}</p>}

      {mode === "view" && (
        <div className="flex gap-2 mt-3">
          <button onClick={() => setMode("edit")} disabled={busy} className="text-xs px-3 py-1.5 rounded-full border">Edit</button>
          <button onClick={() => setMode("regenerate")} disabled={busy} className="text-xs px-3 py-1.5 rounded-full border">Regenerate</button>
          <button onClick={handleDelete} disabled={busy} className="text-xs px-3 py-1.5 rounded-full border border-red-300 text-red-600">
            {busy ? "..." : "Delete"}
          </button>
        </div>
      )}

      {mode === "edit" && (
        <div className="mt-3 space-y-2">
          {EDITABLE_STORY_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-xs opacity-60">{f.label}</label>
              {f.multiline ? (
                <textarea
                  defaultValue={String(story[f.key] ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  className="w-full text-sm border rounded p-2 mt-0.5"
                  rows={3}
                />
              ) : (
                <input
                  defaultValue={String(story[f.key] ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  className="w-full text-sm border rounded p-2 mt-0.5"
                />
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={handleSaveEdit} disabled={busy} className="text-xs px-3 py-1.5 rounded-full bg-black text-white">
              {busy ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setMode("view")} disabled={busy} className="text-xs px-3 py-1.5 rounded-full border">Cancel</button>
          </div>
        </div>
      )}

      {mode === "regenerate" && (
        <div className="mt-3 space-y-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What should change? e.g. 'Address the deposit growth rate as a weakness, not a positive.'"
            className="w-full text-sm border rounded p-2"
            rows={3}
          />
          <div className="flex gap-2">
            <button onClick={handleRegenerate} disabled={busy} className="text-xs px-3 py-1.5 rounded-full bg-black text-white">
              {busy ? "Triggering..." : "Trigger regeneration"}
            </button>
            <button onClick={() => setMode("view")} disabled={busy} className="text-xs px-3 py-1.5 rounded-full border">Cancel</button>
          </div>
          <p className="text-xs opacity-60">Runs the same regenerate-story workflow you&apos;ve used from the Actions tab — takes a minute or two, check there for progress.</p>
        </div>
      )}
    </div>
  );
}

function QuickReadRow({ item, onChanged }: { item: QuickRead; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [snippet, setSnippet] = useState(item.snippet);

  async function handleDelete() {
    if (!confirm(`Delete "${item.headline}" from Quick Reads?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/quick-read", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  // 2026-08-05: added per explicit request — an admin picking a Quick
  // Read (already screened by the extractive/enrichment pipeline, plus
  // whatever the admin personally noticed while browsing) and turning it
  // into a full flagship story, without waiting for the automatic
  // pipeline to independently rediscover and select the same event.
  // Reuses /api/admin/regenerate's existing "--new" mode exactly as the
  // Stories tab's own regenerate button does — this route already just
  // hands the topic off to regenerate-story.yml, so no new backend logic
  // is needed, only a topic string built from what this Quick Read
  // already has on hand (headline, snippet, source, and the original
  // article link so the writer has a concrete starting point).
  async function handlePromote() {
    if (!confirm(`Generate a full detailed story from "${item.headline}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const topic = [
        item.headline,
        item.snippet,
        `(Source: ${item.source}${item.link ? ` — ${item.link}` : ""})`,
      ].filter(Boolean).join("\n\n");
      const res = await fetch("/api/admin/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugOrMode: "--new", feedbackOrTopic: topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Promotion trigger failed");
      setMessage(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Promotion trigger failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/quick-read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, fields: { snippet } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded-xl p-3 mb-3" style={{ borderColor: "var(--border)" }}>
      <p className="text-[13px] font-mono opacity-60">{item.category} &middot; {item.source}</p>
      <p className="font-medium text-[15px]">{item.headline}</p>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {message && <p className="text-sm text-green-700 mt-2">{message}</p>}

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea value={snippet} onChange={(e) => setSnippet(e.target.value)} className="w-full text-sm border rounded p-2" rows={3} />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={busy} className="text-xs px-3 py-1.5 rounded-full bg-black text-white">
              {busy ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setEditing(false)} disabled={busy} className="text-xs px-3 py-1.5 rounded-full border">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mt-2 flex-wrap">
          <button onClick={handlePromote} disabled={busy} className="text-xs px-3 py-1.5 rounded-full bg-black text-white">
            {busy ? "Triggering..." : "Promote to full story"}
          </button>
          <button onClick={() => setEditing(true)} disabled={busy} className="text-xs px-3 py-1.5 rounded-full border">Edit</button>
          <button onClick={handleDelete} disabled={busy} className="text-xs px-3 py-1.5 rounded-full border border-red-300 text-red-600">
            {busy ? "..." : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard({ stories, quickReads }: { stories: Story[]; quickReads: QuickRead[] }) {
  const [tab, setTab] = useState<"stories" | "quickReads">("stories");

  // Full page reload after any change — simplest way to guarantee the
  // list reflects the actual current state (this is an admin tool used
  // occasionally, not a high-frequency UI where a reload would be
  // annoying; correctness over polish here).
  function onChanged() {
    window.location.reload();
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("stories")}
          className="text-sm px-3 py-1.5 rounded-full"
          style={{ background: tab === "stories" ? "var(--navy)" : "transparent", color: tab === "stories" ? "white" : "inherit", border: "1px solid var(--border)" }}
        >
          Stories ({stories.length})
        </button>
        <button
          onClick={() => setTab("quickReads")}
          className="text-sm px-3 py-1.5 rounded-full"
          style={{ background: tab === "quickReads" ? "var(--navy)" : "transparent", color: tab === "quickReads" ? "white" : "inherit", border: "1px solid var(--border)" }}
        >
          Quick Reads ({quickReads.length})
        </button>
      </div>

      {tab === "stories" && stories.map((s) => <StoryRow key={s.slug} story={s} onChanged={onChanged} />)}
      {tab === "quickReads" && quickReads.map((it) => <QuickReadRow key={it.id} item={it} onChanged={onChanged} />)}
    </div>
  );
}
