import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// Every font is served from the repo (next/font/local), never fetched from
// Google at build time: a build that needs no network for fonts cannot fail
// on a font download (PAY-126). Variable fonts, latin subset, from the
// Fontsource packages; each folder keeps its SIL Open Font License as OFL.txt.
// Fraunces was loaded but never used, so it is gone.

const geistSans = localFont({
  src: "./fonts/geist/geist-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono/geist-mono-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
});

const plusJakartaSans = localFont({
  src: "./fonts/plus-jakarta-sans/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

// Brand fonts for the Sentire login screens (design handoff).
const instrumentSans = localFont({
  src: "./fonts/instrument-sans/instrument-sans-latin-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-instrument-sans",
  display: "swap",
});

const hankenGrotesk = localFont({
  src: "./fonts/hanken-grotesk/hanken-grotesk-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-hanken-grotesk",
  display: "swap",
});

// Numeric / mono font for the Sentire admin design system.
const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Inter for the admin (Frappe UI style, Option B).
const inter = localFont({
  src: [
    { path: "./fonts/inter/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/inter/inter-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sentire Payroll — HRIS & Payroll for the Philippines",
  description:
    "Sentire Payroll is a modern, multi-tenant HRIS & Payroll SaaS built for Philippine businesses — fully compliant with BIR, SSS, PhilHealth, and Pag-IBIG.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${plusJakartaSans.variable} ${instrumentSans.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
