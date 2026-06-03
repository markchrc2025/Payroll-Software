import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Move Turbopack's dev cache to the local /tmp filesystem.
  // The workspace is on a slow network drive; /tmp is RAM-backed and
  // prevents the "Slow filesystem" warning from stalling proxy compilation.
  ...(process.env.NODE_ENV !== "production" && {
    distDir: "/tmp/payroll-next-dev",
  }),
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-icons",
      "date-fns",
    ],
  },
};

export default nextConfig;
