import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider, SignInButton, UserButton, Show } from "@clerk/nextjs";
import Script from "next/script";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import HamburgerMenu from "@/components/HamburgerMenu";
import AppDownloadBanner from "@/components/AppDownloadBanner";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale intentionally NOT set to 1 — pinch-zoom stays available for accessibility
  themeColor: "#0b1a33",
};

export const metadata: Metadata = {
  // Absolute base for og:image / twitter card URLs — without this, the
  // share-card image paths stay relative and WhatsApp link previews break.
  metadataBase: new URL("https://whytoday.in"),
  title: "Why Today — Understand today's world, not just today's news",
  description:
    "A modern knowledge platform that helps readers understand the context behind today's headlines through curated data, storytelling, and AI-powered explanations.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Why Today",
  },
  icons: {
    icon: [
      { url: "/icons/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${fraunces.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
      >
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        )}
        <body className="min-h-full flex flex-col overflow-x-hidden pb-16">
          {/* Sticky so the wordmark = one-tap Home from any depth of any page */}
          <header
            className="sticky top-0 z-50 backdrop-blur-md border-b"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in srgb, var(--bg) 86%, transparent)",
            }}
          >
          <div className="max-w-2xl mx-auto w-full px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HamburgerMenu />
              <Link href="/" className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: "var(--gold)" }} />
                <span className="font-display font-semibold text-[15px] tracking-tight" style={{ color: "var(--navy)" }}>
                  Why Today
                </span>
              </Link>
            </div>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="text-[13px] font-medium px-3.5 py-1.5 rounded-full bg-[var(--navy)] text-white whitespace-nowrap">
                  Track your learning →
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
          </header>
          <AppDownloadBanner />
          {children}
          <BottomNav />
          <Script id="sw-register" strategy="afterInteractive">
            {`
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {});
                });
              }
            `}
          </Script>
        </body>
      </html>
    </ClerkProvider>
  );
}
