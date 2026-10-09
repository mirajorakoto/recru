const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:5111",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://127.0.0.1:3111/api/health",
      reuseExistingServer: false,
      timeout: 30_000,
      env: { PORT: "3111" }
    },
    {
      command: "npx vite demo --config demo/vite.config.js --host 127.0.0.1 --port 5111 --strictPort",
      url: "http://127.0.0.1:5111/",
      reuseExistingServer: false,
      timeout: 30_000,
      env: { RECRUITMENT_DEMO_API_URL: "http://127.0.0.1:3111" }
    }
  ]
});
