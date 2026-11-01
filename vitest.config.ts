import { defineConfig } from "vitest/config";

export default defineConfig({
  // supabase/tests needs a running database and has its own command: npm run test:access
  test: { include: ["src/**/*.test.ts"] },
});
