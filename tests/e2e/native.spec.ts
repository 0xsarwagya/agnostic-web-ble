import { expect, test } from "@playwright/test";

import { installFakeCentral } from "./helpers/fake-central";

/**
 * Native adapter journey, driven by CDP BluetoothEmulation.
 *
 * Chromium-only:
 *   - navigator.bluetooth exists nowhere else.
 *   - context.newCDPSession() is Chromium-only.
 *
 * The exact CDP BluetoothEmulation shape has shifted across Chromium
 * versions. This spec is best-effort against tip-of-tree Playwright's
 * bundled Chromium. If your Playwright version's Chromium moved the API,
 * pin @playwright/test to a known-good version and adjust
 * tests/e2e/helpers/fake-central.ts.
 */
test.describe("native adapter via CDP BluetoothEmulation", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "native Web Bluetooth + CDP BluetoothEmulation are Chromium-only",
  );

  test("full journey against a fake battery peripheral", async ({ page }) => {
    const central = await installFakeCentral(page);
    central.autoAcceptChooser();

    const logs: string[] = [];
    page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
    page.on("pageerror", (err) => logs.push(`pageerror: ${err.message}`));

    try {
      await page.goto("/native.html");
      await page.click("#connect");

      await page.waitForFunction(
        () => (window as unknown as { __done?: boolean }).__done === true,
        undefined,
        { timeout: 15_000 },
      );

      await central.pushNotification(new Uint8Array([0x63]));
      await central.pushNotification(new Uint8Array([0x62]));

      await page.waitForFunction(
        () => (window as unknown as { __notifCount?: number }).__notifCount === 2,
        undefined,
        { timeout: 5_000 },
      );

      await page.click("#finish");
      await page.waitForFunction(
        () => (window as unknown as { __finished?: boolean }).__finished === true,
        undefined,
        { timeout: 5_000 },
      );

      const result = await page.evaluate(
        () =>
          (
            window as unknown as {
              __result: {
                deviceName: string | undefined;
                readValue: number;
                notifications: number[];
                disconnected: boolean;
                error?: string;
              };
            }
          ).__result,
      );

      expect(
        result.error,
        `page error: ${result.error}\nlogs:\n${logs.join("\n")}`,
      ).toBeUndefined();
      expect(result.deviceName).toBe("Fake Battery Device");
      expect(result.readValue).toBe(0x64);
      expect(result.notifications).toEqual([0x63, 0x62]);
      expect(result.disconnected).toBe(true);
    } finally {
      await central.teardown();
    }
  });
});
