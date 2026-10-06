import { defineConfig } from "vitest/config";
import path from "node:path";

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://logistics:logistics@localhost:5432/logistics_test?schema=public";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: TEST_DB_URL, NEXTAUTH_SECRET: "test-secret-test-secret-test-secret-123456" },
  },
});
