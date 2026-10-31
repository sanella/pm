import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Set E2E_BASE_URL (e.g. http://localhost:8000) to test an already running app instead.
const externalBaseURL = process.env.E2E_BASE_URL;

// Otherwise e2e starts its own backend (:8001, fresh temp DB) and dev server (:3001),
// so it never touches the dev database or reuses servers started for development.
const e2eDbPath = path.join(os.tmpdir(), `pm-e2e-${Date.now()}.db`);

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: externalBaseURL ?? "http://127.0.0.1:3001",
    trace: "retain-on-failure",
  },
  webServer: externalBaseURL
    ? undefined
    : [
        {
          command: "uv run uvicorn app.main:app --port 8001",
          cwd: "../backend",
          url: "http://127.0.0.1:8001/api/health",
          env: { DB_PATH: e2eDbPath },
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: "npm run dev -- --hostname 127.0.0.1 --port 3001",
          url: "http://127.0.0.1:3001",
          env: { API_URL: "http://127.0.0.1:8001" },
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
