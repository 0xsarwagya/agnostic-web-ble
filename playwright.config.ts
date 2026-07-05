import { defineConfig, devices } from "@playwright/test";

/**
 * Cross-browser matrix for agnostic-web-ble.
 *
 *  chromium-mock       : mock adapter, in-page. Full journey.
 *  firefox-mock        : mock adapter, in-page. Full journey.
 *  webkit-mock         : mock adapter, in-page. Full journey.
 *  chromium-native     : native adapter, driven by CDP BluetoothEmulation.
 *                        Chromium-only because navigator.bluetooth exists
 *                        nowhere else and newCDPSession() is Chromium-only.
 *  firefox-unsupported : verify the library surfaces UNAVAILABLE cleanly.
 *  webkit-unsupported  : same on WebKit.
 *
 * There is no bridge adapter in tree, so no bridge project. When one lands,
 * add bridge-{chromium,firefox,webkit} projects with a shared webServer entry
 * spawning the bridge process against a mock backend.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "pnpm exec vite --config tests/e2e/fixtures/vite.config.ts --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/mock.html",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium-mock",
      testMatch: /mock\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox-mock",
      testMatch: /mock\.spec\.ts$/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit-mock",
      testMatch: /mock\.spec\.ts$/,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "chromium-native",
      testMatch: /native\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox-unsupported",
      testMatch: /unsupported\.spec\.ts$/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit-unsupported",
      testMatch: /unsupported\.spec\.ts$/,
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
