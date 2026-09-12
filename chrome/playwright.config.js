import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.js",
  workers: 1,
  timeout: 45000,
  reporter: "list",
  use: { trace: "off", video: "off" },
});
