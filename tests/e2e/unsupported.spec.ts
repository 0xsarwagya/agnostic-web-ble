import { expect, test } from "@playwright/test";

/**
 * On Firefox and WebKit, navigator.bluetooth does not exist. The native
 * adapter's isAvailable() returns false, so createBluetooth().requestDevice()
 * must throw a BluetoothError with code "UNAVAILABLE".
 *
 * describeAvailability() must NOT throw — it must return a structured
 * report with reason and docsUrl so callers can render an honest
 * "not supported here" UI without try/catch.
 */
test.describe("native adapter on unsupported browsers", () => {
  test.skip(
    ({ browserName }) => browserName === "chromium",
    "Chromium has navigator.bluetooth; covered by native.spec.ts",
  );

  test("surfaces UNAVAILABLE and yields a describeAvailability report", async ({
    page,
  }) => {
    await page.goto("/unsupported.html");
    await page.click("#run");
    await page.waitForFunction(
      () => (window as unknown as { __done?: boolean }).__done === true,
      undefined,
      { timeout: 5_000 },
    );

    const result = await page.evaluate(
      () =>
        (
          window as unknown as {
            __result: {
              threw: boolean;
              name?: string;
              code?: string;
              operation?: string;
              recoverable?: boolean;
              message?: string;
              reports?: Array<{
                adapterId: string;
                available: boolean;
                reason?: string;
                docsUrl?: string;
              }>;
              describeError?: string;
            };
          }
        ).__result,
    );

    expect(result.describeError).toBeUndefined();
    expect(result.threw).toBe(true);
    expect(result.name).toBe("BluetoothError");
    expect(result.code).toBe("UNAVAILABLE");
    expect(result.operation).toBe("capabilities");
    expect(result.recoverable).toBe(false);
    expect(result.message).toContain("native-web-bluetooth");
    expect(result.message).toContain(
      "https://oss.sarwagya.wtf/agnostic-web-ble/docs/compatibility",
    );

    expect(result.reports).toBeDefined();
    expect(result.reports).toHaveLength(1);
    const first = result.reports![0]!;
    expect(first.available).toBe(false);
    expect(first.reason).toMatch(/Web Bluetooth/);
    expect(first.docsUrl).toBe(
      "https://oss.sarwagya.wtf/agnostic-web-ble/docs/compatibility",
    );

    const hasBluetooth = await page.evaluate(
      () =>
        typeof (navigator as { bluetooth?: unknown }).bluetooth !== "undefined",
    );
    expect(hasBluetooth).toBe(false);
  });
});
