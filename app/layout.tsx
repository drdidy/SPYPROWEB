import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPY Prophet · Discipline before conviction",
  description:
    "Anchor-driven SPY trading workspace. Read the day before the day reads you. Anchors, lines, graded signals, and the discipline to wait for a setup that earns the trade.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-canvas text-ink font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
