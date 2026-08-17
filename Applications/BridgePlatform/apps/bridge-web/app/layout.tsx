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
      {/* suppressHydrationWarning is for BROWSER EXTENSIONS, not for us.
          ColorZilla stamps cz-shortcut-listen="true" onto <body> before React
          hydrates, and Grammarly and friends do the same with attributes of
          their own; the server HTML cannot contain them, so every page load
          throws a hydration error that is nobody's bug and hides real ones.

          It is safe HERE and would not be elsewhere: this body carries one
          static className and nothing derived from a date, a random number or
          the window, so there is no genuine mismatch it could be masking. React
          applies this to THIS element's attributes and text only — it does not
          recurse — so every component below still reports mismatches normally. */}
      <body className="min-h-screen text-neutral-900 antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
