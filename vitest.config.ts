import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/money.ts", "src/lib/statutory/**", "src/lib/payroll/engine.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
