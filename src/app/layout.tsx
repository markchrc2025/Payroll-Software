import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// Every font is served from the repo (PAY-126): a build never downloads from
// Google Fonts. Each file is the Google Fonts variable font covering Latin and
// Latin Extended in one file, so the peso sign (U+20B1, Latin Extended) renders
// in the brand font. Licences: OFL.txt beside each file. How the files were
// made and checked: src/app/fonts/README.md.

// Geist and Geist Mono are second in the stacks behind Instrument Sans and
// JetBrains Mono (globals.css). Neither of those has a peso sign, so Geist draws
// ₱ there. Not preloaded: the browser fetches them only when a page needs a
// glyph the first font lacks.
const geistSans = localFont({
  src: [{ path: "./fonts/geist/geist-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-geist-sans",
  preload: false,
});

const geistMono = localFont({
  src: [{ path: "./fonts/geist-mono/geist-mono-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-geist-mono",
  preload: false,
});

const plusJakartaSans = localFont({
  src: [{ path: "./fonts/plus-jakarta-sans/plus-jakarta-sans-wght-normal.woff2", weight: "200 800", style: "normal" }],
  variable: "--font-plus-jakarta-sans",
});

// Brand fonts for the Sentire login screens (design handoff).
const instrumentSans = localFont({
  src: [{ path: "./fonts/instrument-sans/instrument-sans-wght-normal.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-instrument-sans",
});

const hankenGrotesk = localFont({
  src: [{ path: "./fonts/hanken-grotesk/hanken-grotesk-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-hanken-grotesk",
});

// Numeric / mono font for the Sentire admin design system.
const jetbrainsMono = localFont({
  src: [{ path: "./fonts/jetbrains-mono/jetbrains-mono-wght-normal.woff2", weight: "100 800", style: "normal" }],
  variable: "--font-jetbrains-mono",
});

// Inter for the admin (Frappe UI style, Option B).
const inter = localFont({
  src: [
    { path: "./fonts/inter/inter-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/inter/inter-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-inter",
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
