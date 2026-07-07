import type { Metadata } from "next";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider, SignInButton, UserButton, Show } from "@clerk/nextjs";
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

export const metadata: Metadata = {
  title: "Why Today — Understand today's world, not just today's news",
  description:
    "A modern knowledge platform that helps readers understand the context behind today's headlines through curated data, storytelling, and AI-powered explanations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${fraunces.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col overflow-x-hidden">
          <div className="max-w-2xl mx-auto w-full px-4 pt-3 flex justify-end">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="text-sm font-medium px-3.5 py-1.5 rounded-full bg-[var(--navy)] text-white">
                  Sign in
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
