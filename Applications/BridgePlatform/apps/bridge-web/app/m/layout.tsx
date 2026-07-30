import type { Metadata } from "next";
import { Fraunces, Karla } from "next/font/google";
import { EmbedLocationReporter } from "@/components/mobile/EmbedLocationReporter";
import { TabBar } from "@/components/mobile/TabBar";
import { isEmbeddedLaunch } from "@/lib/nexus";

// Load the design's two typefaces and expose them as CSS variables so every
// mobile component can reach them via var(--font-fraunces) / var(--font-karla).
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fraunces",
  display: "swap",
});
const karla = Karla({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-karla",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bridge Platform",
};

/** Mobile shell (nested under the root <html> layout). Frames a phone-width
 *  column on a warm neutral backdrop so it reads as a device on wide screens
 *  while filling the viewport on a phone. The bottom TabBar anchors to this
 *  container; list screens pad their own bottom so content clears it. */
export default async function MobileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Embedded in the coach app: the HOST owns navigation — Bridge shows only
  // the screen it was asked for (no tab bar, no avatar menu, no way to roam).
  const embedded = await isEmbeddedLaunch();
  return (
    <div
      className={`${fraunces.variable} ${karla.variable}`}
      style={{
        minHeight: "100dvh",
        background: "#ded7c6",
        display: "flex",
        justifyContent: "center",
        fontFamily: "var(--font-karla), system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 430,
          height: "100dvh",
          background: "#faf8f2",
          overflow: "hidden",
          boxShadow: "0 0 60px rgba(0,0,0,.12)",
        }}
      >
        {children}
        {embedded ? <EmbedLocationReporter /> : <TabBar />}
      </div>
    </div>
  );
}
