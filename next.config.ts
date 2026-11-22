import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Keep Turbopack dev cache inside workspace/tmp so it survives HMR
  // but under a predictable path we can wipe cleanly.
  distDir: process.env.NODE_ENV === "production" ? ".next" : "tmp/payroll-next-dev",
  // Build speed (Mark, 22 Nov 2026): `next build` no longer repeats the type
  // check. Types are gated before anything reaches main: `tsc --noEmit` runs
  // in CI on every pull request and on every push to main, and in the local
  // gate before a PR. On the production server the repeated check took 2.7
  // minutes and most of the build's memory (docs/CI.md measured ~7 GB).
  typescript: { ignoreBuildErrors: true },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-icons",
      "date-fns",
    ],
  },
};

export default nextConfig;
