// Flat ESLint config (LAIC M0 linting deliverable).
// Pragmatic baseline: real correctness rules on, noisy stylistic rules relaxed
// so the existing tree lints clean today; teams can tighten per milestone.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "public/**",
      "contracts/generated/**", // auto-generated; drift check guards these instead
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.mjs", "**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "no-undef": "off", // TypeScript handles this; avoids false positives on globals
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-assignment": "warn", // quality signal, not a build-blocking correctness rule
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
