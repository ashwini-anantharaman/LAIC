import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bridge Platform",
  description:
    "LAIC Bridge Platform: practice bridge with configurable, explainable AI players.",
};

/**
 * No pinch or double-tap zoom. The coach app embeds these pages in a WebView,
 * and rapid taps at the table read to iOS as a double-tap zoom — the table
 * scales, pans off to one side and STAYS there (tester report 2026-08-08:
 * "table moves to the left during interactions and gets stuck"). The table is
 * a designed fixed-stage surface that does its own scaling; browser zoom has
 * nothing to offer it. Desktop browser zoom (Ctrl +/−) is unaffected.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
