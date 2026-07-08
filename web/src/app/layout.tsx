import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://labsynch.com"),
  title: "LabSynch — Lab Operations Platform",
  description: "LabSynch — one portal for lab inventory, scheduling, maintenance, safety, requests, procurement and documents.",
  applicationName: "LabSynch",
  keywords: ["lab management", "laboratory operations", "lab inventory", "lab scheduling", "LabSynch"],
  alternates: { canonical: "/" },
  openGraph: {
    title: "LabSynch — Lab Operations Platform",
    description: "One portal for lab inventory, scheduling, maintenance, safety, requests, procurement and documents.",
    url: "https://labsynch.com",
    siteName: "LabSynch",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "LabSynch — Lab Operations Platform", description: "One portal for every lab operation." },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "LabSynch" },
  icons: {
    icon: [
      { url: "/icon-192.png?v=3", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=3", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png?v=3",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A1628",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}<PwaRegister /></body>
    </html>
  );
}
