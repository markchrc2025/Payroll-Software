import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces, Plus_Jakarta_Sans, Instrument_Sans, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Brand fonts for the Sentire login screens (design handoff).
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Numeric / mono font for the Sentire admin design system.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Inter for the admin (Frappe UI style, Option B). Served from the repo, not
// fetched from Google at build time (see PAY-126). SIL Open Font License,
// copied beside the files as OFL.txt.
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
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${plusJakartaSans.variable} ${instrumentSans.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
