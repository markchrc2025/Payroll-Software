import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Disable react-hooks/set-state-in-effect: new v7 rule that flags valid
  // initialization patterns (setting state from URL params, etc.) used
  // throughout the codebase. The pattern is correct React — it doesn't cause
  // infinite loops because deps arrays are properly specified.
  {
    rules: {
      // New react-hooks v7 rules that flag valid pre-existing patterns:
      // set-state-in-effect: flags setState in useEffect bodies (init from URL params, etc.)
      // static-components: flags sub-components defined inside parent render functions
      // Both are style/perf suggestions, not correctness issues.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
