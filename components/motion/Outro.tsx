import { VisualTheme } from "@/lib/visualEngine/types";

export interface OutroProps {
  tagline: string;
  ctaLabel: string;
  url: string;
  videoUrl?: string; // /api/visual-video/[slug] — 404s until scripts/upload-visual-videos.js has rendered+uploaded this story
  theme: VisualTheme;
  qrDataUri?: string; // generated server-side (app/visual-preview/[slug]/page.tsx), same `qrcode` package as scripts/generate-share-cards.js
}

export default function Outro({ tagline, ctaLabel, url, videoUrl, theme, qrDataUri }: OutroProps) {
  return (
    <div className="text-center flex flex-col items-center">
      <p className="font-display text-2xl font-semibold leading-snug mb-6" style={{ color: theme.text }}>
        {tagline}
      </p>
      <a
        href={url}
        className="inline-flex items-center gap-1.5 rounded-full px-6 py-3 text-sm font-semibold text-white mb-4"
        style={{ background: theme.positive }}
      >
        {ctaLabel}
      </a>
      {videoUrl && (
        <a
          href={videoUrl}
          download
          className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold mb-8"
          style={{ border: `1px solid ${theme.accent}`, color: theme.accent }}
        >
          ⬇ Download Video
        </a>
      )}
      {qrDataUri && (
        <div className="mb-3">
          <img src={qrDataUri} alt="QR code linking to this story" className="w-32 h-32 mx-auto rounded-lg" />
          <p className="text-xs mt-2" style={{ color: theme.textMuted }}>
            Scan for this exact story
          </p>
        </div>
      )}
      <p className="font-display font-semibold mt-6" style={{ color: theme.accent }}>
        whytoday.in
      </p>
    </div>
  );
}
