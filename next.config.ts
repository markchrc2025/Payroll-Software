import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Keep Turbopack dev cache inside workspace/tmp so it survives HMR
  // but under a predictable path we can wipe cleanly.
  distDir: process.env.NODE_ENV === "production" ? ".next" : "tmp/payroll-next-dev",
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-icons",
      "date-fns",
    ],
  },
};

export default nextConfig;
