import { expect, test } from "@playwright/test";

/**
 * Mock-adapter journey, identical across every browser.
 *
 * The mock adapter is pure JS with no platform dependency, so this
 * exercises the full public API (request → connect → read → subscribe
 * → unsubscribe → disconnect) identically on Chromium, Firefox, WebKit.
 */
test.describe("mock adapter contract", () => {
  test("full journey: request → connect → read → subscribe → disconnect", async ({
    page,
  }) => {
    const logs: string[] = [];
    page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
    page.on("pageerror", (err) => logs.push(`pageerror: ${err.message}`));

    await page.goto("/mock.html");
    await page.click("#run");
    await page.waitForFunction(
      () => (window as unknown as { __done?: boolean }).__done === true,
      undefined,
      { timeout: 10_000 },
    );

    const result = await page.evaluate(
      () =>
        (
          window as unknown as {
            __result: {
              deviceName: string | undefined;
              connected: boolean;
              readValue: number;
              notifications: number[];
              unsubscribed: boolean;
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
    expect(result.deviceName).toBe("Mock Battery");
    expect(result.connected).toBe(true);
    expect(result.readValue).toBe(0x64);
    expect(result.notifications).toEqual([0x63, 0x62]);
    expect(result.unsubscribed).toBe(true);
    expect(result.disconnected).toBe(true);
  });
});
