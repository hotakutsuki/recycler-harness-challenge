import type { Metadata, Viewport } from "next";
import { getLang } from "@/lib/i18n.server";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecycleOps",
  description: "Weighing-sheet digitizer for recycling yards",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1f2933",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
