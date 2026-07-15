import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    rules: {
      // CLAUDE.md: keine `any` ohne schriftliche Begründung
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  { ignores: [".next/**", "next-env.d.ts", "node_modules/**"] },
];

export default config;
