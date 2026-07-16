import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bridge Platform",
  description:
    "LAIC Bridge Platform: practice bridge with configurable, explainable AI players.",
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
