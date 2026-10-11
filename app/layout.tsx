import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const display = Playfair_Display({ variable: "--font-display-face", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cena con Delitto",
  description: "Gioca cene con delitto dal vivo con gli amici: il telefono fa da regista.",
  appleWebApp: { capable: true, title: "Cena con Delitto", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e0c0b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
