import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "GrillCrew FCTC",
  description: "Helfer- und Einsatzplanung für den FC Thusis-Cazis",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de-CH">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
