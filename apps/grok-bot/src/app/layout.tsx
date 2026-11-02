import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { THEME_SCRIPT } from "@/components/theme";
import { getViewer } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://grok-bot.directory",
  ),
  title: { default: "Grok Bot Directory", template: "%s · Grok Bot Directory" },
  description:
    "Find community-built Grok Bots for every job, ranked by what's trending.",
  openGraph: {
    type: "website",
    siteName: "Grok Bot Directory",
    title: "Grok Bot Directory",
    description:
      "Find community-built Grok Bots for every job, ranked by what's trending.",
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // A Supabase outage shouldn't take every page down: show signed out.
  const viewer = await getViewer().catch(() => null);
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Sets data-theme before paint, so there is no flash of the wrong theme. */}
        <Script id="theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        <Header viewer={viewer} />
        <main style={{ minHeight: "100vh" }}>{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
