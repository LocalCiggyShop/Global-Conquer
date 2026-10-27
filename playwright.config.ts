import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.WORLD_RTS_BASE_URL ?? "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.WORLD_RTS_BROWSER,
      args:
        process.platform === "win32"
          ? ["--ignore-gpu-blocklist"]
          : [
              "--use-gl=angle",
              "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader",
              "--ignore-gpu-blocklist",
            ],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: process.env.WORLD_RTS_BASE_URL ?? "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
