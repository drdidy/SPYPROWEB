import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const SITE_URL = "https://www.spyprophet.app";
const SITE_NAME = "SPY Prophet";
const SITE_DESC =
  "A decision workspace for serious retail traders. Read the day before the day reads you. Same routine every morning. A workspace, not a feed.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} · Discipline before conviction`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  keywords: [
    "SPY",
    "SPX",
    "options trading",
    "trading workspace",
    "decision support",
    "anchor trading",
    "decision slate",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${SITE_NAME} · Discipline before conviction`,
    description: SITE_DESC,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — a decision workspace for serious retail traders.`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} · Discipline before conviction`,
    description: SITE_DESC,
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // icon.tsx + apple-icon.tsx routes serve 32×32 + 180×180.
  // PWA 192/512 sizes are advertised through manifest.ts.
};

export const viewport: Viewport = {
  themeColor: "#FAF8F3",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-canvas text-ink font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
