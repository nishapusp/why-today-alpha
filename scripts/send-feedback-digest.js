#!/usr/bin/env node
/**
 * Sends a daily email digest of the previous day's feedback — both the
 * per-story 👍/👎 (+ comments) and the app-level 5-question survey.
 *
 * Story feedback has no per-submission timestamp in its own record (just
 * running up/down counts — see app/api/feedback/route.ts) so "today's"
 * reactions are read from a separate events:{YYYY-MM-DD} key that route
 * now also writes (added alongside this script, 2026-07-15). App feedback
 * already timestamps each submission (submittedAt, UTC ISO) — this script
 * converts that to IST and buckets by calendar day to match how the rest
 * of the site dates things, rather than relying on UTC-day boundaries
 * (which would occasionally misfile a late-night IST submission into the
 * wrong day).
 *
 * Runs once daily via .github/workflows/send-feedback-digest.yml.
 *
 * Env required:
 *   NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN — same Netlify credentials already
 *     used elsewhere (Site settings > General; User settings > Applications).
 *   RESEND_API_KEY — from resend.com (free tier). No domain verification
 *     needed to start: Resend allows sending from onboarding@resend.dev
 *     at low volume, which is what FROM_EMAIL defaults to below.
 *   FEEDBACK_DIGEST_EMAIL — where to send the digest.
 */

const { getStore } = require("@netlify/blobs");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function istDateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function feedbackStore() {
  return getStore({
    name: "why-today-feedback",
    siteID: requireEnv("NETLIFY_SITE_ID"),
    token: requireEnv("NETLIFY_AUTH_TOKEN"),
  });
}

function appFeedbackStore() {
  return getStore({
    name: "why-today-app-feedback",
    siteID: requireEnv("NETLIFY_SITE_ID"),
    token: requireEnv("NETLIFY_AUTH_TOKEN"),
  });
}

async function getStoryEvents(dateKey) {
  const store = feedbackStore();
  try {
    const raw = await store.get(`events:${dateKey}`, { type: "text" });
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function getAppFeedbackForDate(dateKey) {
  const store = appFeedbackStore();
  const results = [];
  try {
    const { blobs } = await store.list();
    for (const { key } of blobs) {
      try {
        const raw = await store.get(key, { type: "text" });
        if (!raw) continue;
        const record = JSON.parse(raw);
        if (istDateKey(new Date(record.submittedAt)) === dateKey) results.push(record);
      } catch {
        // Skip a malformed record rather than failing the whole digest.
      }
    }
  } catch {
    // Store might not exist yet if no one has submitted the survey.
  }
  return results;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function buildEmailHtml(dateKey, storyEvents, appFeedback) {
  const up = storyEvents.filter((e) => e.reaction === "up").length;
  const down = storyEvents.filter((e) => e.reaction === "down").length;
  const comments = storyEvents.filter((e) => e.comment);

  const storySection = storyEvents.length === 0
    ? "<p>No story reactions today.</p>"
    : `<p><strong>${up}</strong> 👍 &nbsp; <strong>${down}</strong> 👎</p>` +
      (comments.length
        ? `<ul>${comments.map((e) => `<li><strong>${escapeHtml(e.slug)}</strong>: ${escapeHtml(e.comment)}</li>`).join("")}</ul>`
        : "");

  const appSection = appFeedback.length === 0
    ? "<p>No survey submissions today.</p>"
    : `<ul>${appFeedback
        .map(
          (f) =>
            `<li>Writing level: <strong>${escapeHtml(f.writingLevel)}</strong> · Length: <strong>${escapeHtml(f.length)}</strong> · Would recommend: <strong>${escapeHtml(f.wouldRecommend)}</strong>` +
            (f.wantMore?.length ? ` · Wants more: ${escapeHtml(f.wantMore.join(", "))}` : "") +
            (f.comment ? `<br>&ldquo;${escapeHtml(f.comment)}&rdquo;` : "") +
            `</li>`
        )
        .join("")}</ul>`;

  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color:#0b1a33;">Why Today — Feedback Digest, ${dateKey}</h2>
      <h3 style="color:#0b1a33;">Story reactions</h3>
      ${storySection}
      <h3 style="color:#0b1a33;">Survey submissions</h3>
      ${appSection}
    </div>
  `;
}

async function sendEmail(subject, html) {
  const apiKey = requireEnv("RESEND_API_KEY");
  const to = requireEnv("FEEDBACK_DIGEST_EMAIL");
  const from = process.env.FEEDBACK_DIGEST_FROM || "Why Today <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    throw new Error(`Resend API error: HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function main() {
  // Digest covers YESTERDAY (IST) — this runs once/day, so "today" isn't
  // over yet at whatever time the cron fires; yesterday is always complete.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateKey = istDateKey(yesterday);

  console.log(`Building feedback digest for ${dateKey}...`);
  const [storyEvents, appFeedback] = await Promise.all([getStoryEvents(dateKey), getAppFeedbackForDate(dateKey)]);
  console.log(`Story events: ${storyEvents.length} | Survey submissions: ${appFeedback.length}`);

  const html = buildEmailHtml(dateKey, storyEvents, appFeedback);
  await sendEmail(`Why Today feedback digest — ${dateKey}`, html);
  console.log("Digest email sent.");
}

main().catch((err) => {
  console.error("Feedback digest failed:", err.message);
  process.exit(1);
});
